/**
 * Raw shape of one transaction row as observed on a malki.in building page's
 * "TRANSACTION HISTORY" table (Phase 21 feasibility test — confirmed live,
 * public, no login/CAPTCHA, buyer/seller names never shown by the source).
 * Every field is optional since real page rows sometimes omit one (e.g. VALUE
 * is "–" for several instrument types).
 */
export interface MalkiTransactionRecord {
  /** The building/project page this record was read from, e.g. "Gurukrupa Ekam". */
  buildingName?: string;
  /** The building page's locality, e.g. "Andheri West". */
  locality?: string;
  /** As displayed, e.g. "27 Jun 2026". */
  date?: string;
  /** As displayed, e.g. "New Agreement For Sale", "Lease Deed", "Mortgage Deed", "Gift Deed", "Leave & License". */
  instrument?: string;
  /** As displayed, e.g. "A Wing-1806" — format is inconsistent across buildings, never split. */
  unit?: string;
  /** As displayed, e.g. "1,052" or 1052. */
  carpetSqft?: string | number;
  /** As displayed, e.g. "₹3.69 Cr", "₹1 L/mo" (a lease's monthly rent, not a lump sum), or "–" (not disclosed). */
  value?: string | number;
  /** The registration/document reference exactly as shown, e.g. "322/11484". The strongest available identifier. */
  docRef?: string;
  /** The building page URL this record came from. */
  sourceUrl?: string;
  [key: string]: unknown;
}

/**
 * Non-destructive quality metadata the normalizer attaches to its output —
 * mirrors the MagicBricks normalizer's QUALITY_FLAGS discipline (Phase 11),
 * plus one Malki-specific concern (a lease's monthly rate being structurally
 * unlike a lump-sum sale value) and one Phase-22-specific concern (a
 * registration number repeated within the SAME extraction batch — the one
 * duplicate shape the existing transactionFileImportRunner genuinely cannot
 * catch on its own, since its pending/live duplicate check is snapshotted
 * once before a batch's own rows are created; see runner's own doc comments).
 */
export const MALKI_QUALITY_FLAGS = [
  "VALUE_MISSING",
  "VALUE_AMBIGUOUS_LEASE_RATE",
  "AREA_MISSING",
  "AREA_UNPARSEABLE",
  "DATE_MISSING",
  "DATE_UNPARSEABLE",
  "INSTRUMENT_MISSING",
  "INSTRUMENT_UNSUPPORTED",
  "DOC_REF_MISSING",
  "LOCALITY_MISSING",
  "PROJECT_NAME_MISSING",
  "DUPLICATE_DOC_REF_IN_BATCH",
] as const;
export type MalkiQualityFlag = (typeof MALKI_QUALITY_FLAGS)[number];

/**
 * One transaction candidate's row data, using ONLY key spellings already
 * present in TRANSACTION_COLUMN_ALIASES (lib/ingestion/connectors/fileImport/columnMapping.ts)
 * so this object can be JSON.stringify'd and handed to the EXISTING
 * runTransactionFileImport() exactly like any manual CSV/JSON upload — zero
 * importer changes. camelCase keys survive normalizeHeader() unchanged (it
 * splits camelCase word boundaries before matching aliases).
 */
export interface NormalizedMalkiTransactionRow {
  locality: string;
  project?: string;
  /** Always "sale" today — see normalizeMalkiTransactions.ts's doc comment on why lease/mortgage/gift are never emitted as a candidate. */
  type: "sale";
  registrationDate: string;
  value: number;
  carpetSqft?: number;
  unitLabel?: string;
  registrationNumber: string;
  confidence?: "High" | "Medium" | "Low";
  sourceNote?: string;
}

export interface NormalizedMalkiTransactionCandidate {
  row: NormalizedMalkiTransactionRow;
  flags: MalkiQualityFlag[];
}

export type UnresolvedReason = MalkiQualityFlag;

export interface UnresolvedMalkiRecord {
  reason: UnresolvedReason;
  record: MalkiTransactionRecord;
}

export interface MalkiNormalizeResult {
  candidates: NormalizedMalkiTransactionCandidate[];
  unresolved: UnresolvedMalkiRecord[];
}
