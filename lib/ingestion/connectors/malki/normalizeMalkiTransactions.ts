import type {
  MalkiNormalizeResult,
  MalkiQualityFlag,
  MalkiTransactionRecord,
  NormalizedMalkiTransactionCandidate,
  NormalizedMalkiTransactionRow,
  UnresolvedMalkiRecord,
} from "./types";

/**
 * Malki transaction normalizer -- Phase 22.
 *
 * Converts raw per-deed rows read from a malki.in building page's public
 * "TRANSACTION HISTORY" table (Phase 21 feasibility test) into candidates
 * ready to be JSON.stringify'd and handed to the EXISTING, unmodified
 * runTransactionFileImport() (lib/ingestion/transactionFileImportRunner.ts)
 * -- the same way lib/ingestion/apifyBridge.ts already feeds normalized
 * MagicBricks project rows into runProjectFileImport(). This module does not
 * import Prisma, does not write to the database, and does not create
 * IngestStagingRecord rows -- the existing runner remains solely responsible
 * for validation, locality/project resolution, cross-batch duplicate
 * detection, and staging.
 *
 * Deliberately narrow scope, matching the Phase 21 finding exactly: only
 * "Agreement For Sale" / "New Agreement For Sale" / "Sale Deed" instruments
 * become candidates. Lease Deed / Leave & License show a MONTHLY rate on
 * malki.in, not a lump-sum value -- forcing that into our single `value`
 * field would misrepresent it, so lease rows are never fabricated into a
 * candidate. Mortgage Deed / Gift Deed aren't sales or leases at all and have
 * no home in the existing TransactionType enum (SALE/RESALE/LEASE) --
 * excluded, not guessed into the nearest bucket.
 */

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const SALE_INSTRUMENTS = new Set(["agreement for sale", "new agreement for sale", "sale deed"]);

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Parses malki.in's "27 Jun 2026" date display into the existing importer's
 * expected registration-date string. Also passes through an already-ISO date
 * unchanged. Never guesses a date it can't confidently parse.
 */
export function normalizeMalkiDate(raw: string | undefined | null): { iso: string | null; flag?: MalkiQualityFlag } {
  if (!raw || !raw.trim()) return { iso: null, flag: "DATE_MISSING" };
  const trimmed = normalizeSpace(raw);

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    return { iso: trimmed };
  }

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return { iso: null, flag: "DATE_UNPARSEABLE" };

  const day = Number(match[1]);
  const month = MONTH_NAMES[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return { iso: null, flag: "DATE_UNPARSEABLE" };

  return { iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/**
 * Parses malki.in's value display -- "₹3.69 Cr", "₹25 L", a bare number, a
 * lease's "₹1 L/mo", or "–" (not disclosed by the underlying IGR record).
 * A "/mo" suffix is a monthly rate, not a lump-sum transaction value -- never
 * converted into one; flagged instead, exactly like an unparseable value.
 */
export function normalizeMalkiValue(raw: string | number | undefined | null): { rupees: number | null; flag?: MalkiQualityFlag } {
  if (raw === undefined || raw === null) return { rupees: null, flag: "VALUE_MISSING" };
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? { rupees: raw } : { rupees: null, flag: "VALUE_MISSING" };

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "–" || trimmed === "-") return { rupees: null, flag: "VALUE_MISSING" };
  if (/\/\s*mo\b/i.test(trimmed)) return { rupees: null, flag: "VALUE_AMBIGUOUS_LEASE_RATE" };

  const cleaned = trimmed.replace(/[₹,]/g, "").trim();
  const match = cleaned.match(/^([\d.]+)\s*(cr|crore|l|lakh|lac)?$/i);
  if (!match) return { rupees: null, flag: "VALUE_MISSING" };

  const amount = Number(match[1]);
  if (Number.isNaN(amount) || amount <= 0) return { rupees: null, flag: "VALUE_MISSING" };

  const unit = match[2]?.toLowerCase();
  if (unit === "cr" || unit === "crore") return { rupees: amount * 1e7 };
  if (unit === "l" || unit === "lakh" || unit === "lac") return { rupees: amount * 1e5 };
  return { rupees: amount };
}

/** Parses "1,052" / "814" / an already-numeric carpet area. Never guesses a value from an unparseable string. */
export function normalizeMalkiArea(raw: string | number | undefined | null): { sqft: number | null; flag?: MalkiQualityFlag } {
  if (raw === undefined || raw === null) return { sqft: null, flag: "AREA_MISSING" };
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? { sqft: raw } : { sqft: null, flag: "AREA_MISSING" };

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "–" || trimmed === "-") return { sqft: null, flag: "AREA_MISSING" };

  const cleaned = trimmed.replace(/,/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n) || n <= 0) return { sqft: null, flag: "AREA_UNPARSEABLE" };
  return { sqft: n };
}

/** Only the sale-deed family becomes a candidate -- see this module's own doc comment for why lease/mortgage/gift are excluded, not guessed. */
export function mapMalkiInstrumentToType(raw: string | undefined | null): { type: "sale" | null; flag?: MalkiQualityFlag } {
  if (!raw || !raw.trim()) return { type: null, flag: "INSTRUMENT_MISSING" };
  const normalized = normalizeSpace(raw).toLowerCase();
  return SALE_INSTRUMENTS.has(normalized) ? { type: "sale" } : { type: null, flag: "INSTRUMENT_UNSUPPORTED" };
}

function buildSourceNote(record: MalkiTransactionRecord): string {
  const base = "Maharashtra IGR Index-II mirror, publicly obtained from malki.in. Buyer/seller names not shown by source.";
  return record.sourceUrl ? `Source: ${record.sourceUrl} — ${base}` : base;
}

/**
 * Main entry point. Every record is validated independently first; only
 * AFTER that pass does this function check for a registration number
 * repeated across the batch (Phase 22 Part D) -- the one duplicate shape the
 * existing transactionFileImportRunner cannot catch on its own, since its
 * pending/live duplicate check is snapshotted once before a batch's own rows
 * are created. Colliding records are removed from `candidates` entirely and
 * reported in `unresolved` with reason DUPLICATE_DOC_REF_IN_BATCH -- never
 * silently merged, never silently duplicated.
 */
export function normalizeMalkiTransactions(records: MalkiTransactionRecord[]): MalkiNormalizeResult {
  const unresolved: UnresolvedMalkiRecord[] = [];
  const provisional: { record: MalkiTransactionRecord; candidate: NormalizedMalkiTransactionCandidate; docRef: string }[] = [];

  for (const record of records) {
    const locality = record.locality?.trim();
    if (!locality) {
      unresolved.push({ reason: "LOCALITY_MISSING", record });
      continue;
    }

    const docRef = record.docRef?.trim();
    if (!docRef) {
      unresolved.push({ reason: "DOC_REF_MISSING", record });
      continue;
    }

    const { type, flag: instrumentFlag } = mapMalkiInstrumentToType(record.instrument);
    if (!type) {
      unresolved.push({ reason: instrumentFlag ?? "INSTRUMENT_UNSUPPORTED", record });
      continue;
    }

    const { iso: registrationDate, flag: dateFlag } = normalizeMalkiDate(record.date);
    if (!registrationDate) {
      unresolved.push({ reason: dateFlag ?? "DATE_UNPARSEABLE", record });
      continue;
    }

    const { rupees: value, flag: valueFlag } = normalizeMalkiValue(record.value);
    if (value === null) {
      unresolved.push({ reason: valueFlag ?? "VALUE_MISSING", record });
      continue;
    }

    const { sqft: carpetSqft, flag: areaFlag } = normalizeMalkiArea(record.carpetSqft);

    const flags: MalkiQualityFlag[] = [];
    if (areaFlag) flags.push(areaFlag);
    const projectName = record.buildingName?.trim();
    if (!projectName) flags.push("PROJECT_NAME_MISSING");

    const row: NormalizedMalkiTransactionRow = {
      locality,
      ...(projectName ? { project: projectName } : {}),
      type,
      registrationDate,
      value,
      ...(carpetSqft !== null ? { carpetSqft } : {}),
      ...(record.unit?.trim() ? { unitLabel: normalizeSpace(record.unit) } : {}),
      registrationNumber: docRef,
      confidence: projectName && carpetSqft !== null && record.unit?.trim() ? "High" : "Medium",
      sourceNote: buildSourceNote(record),
    };

    provisional.push({ record, candidate: { row, flags }, docRef: docRef.toUpperCase() });
  }

  const byDocRef = new Map<string, typeof provisional>();
  for (const item of provisional) {
    const group = byDocRef.get(item.docRef) ?? [];
    group.push(item);
    byDocRef.set(item.docRef, group);
  }

  const candidates: NormalizedMalkiTransactionCandidate[] = [];
  for (const group of byDocRef.values()) {
    if (group.length > 1) {
      for (const item of group) unresolved.push({ reason: "DUPLICATE_DOC_REF_IN_BATCH", record: item.record });
      continue;
    }
    candidates.push(group[0].candidate);
  }

  return { candidates, unresolved };
}
