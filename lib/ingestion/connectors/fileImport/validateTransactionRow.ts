import { CONFIDENCE_LEVELS, TRANSACTION_TYPES, type Confidence, type TransactionType } from "@/lib/project-meta";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]+/g, " ");
}

const TYPE_LOOKUP = new Map<string, TransactionType>();
for (const type of TRANSACTION_TYPES) TYPE_LOOKUP.set(normalizeLabel(type), type);
TYPE_LOOKUP.set("rent", "LEASE");
TYPE_LOOKUP.set("rental", "LEASE");
TYPE_LOOKUP.set("new sale", "SALE");
TYPE_LOOKUP.set("secondary", "RESALE");
TYPE_LOOKUP.set("secondary sale", "RESALE");

export interface ValidatedTransactionRow {
  localityName: string;
  projectName?: string;
  type: TransactionType;
  registrationDate: Date;
  valueRupees: number;
  carpetSqft?: number;
  bedrooms?: number;
  tower?: string;
  unitLabel?: string;
  /** A real external document/registration number, when the source provides one — never fabricated. */
  registrationNumber?: string;
  confidence?: Confidence;
  sourceNote?: string;
}

export type TransactionValidationResult = { ok: true; data: ValidatedTransactionRow } | { ok: false; error: string };

/** Required-field and sanity checks only — mirrors validateProjectRow.ts's discipline. */
export function validateTransactionRow(mapped: Record<string, string>): TransactionValidationResult {
  const localityName = mapped.localityName?.trim();
  if (!localityName) return { ok: false, error: "Missing locality" };

  const rawType = mapped.type ? normalizeLabel(mapped.type) : "sale";
  const type = TYPE_LOOKUP.get(rawType) ?? (!mapped.type ? "SALE" : undefined);
  if (!type) return { ok: false, error: `Unrecognized transaction type "${mapped.type}"` };

  if (!mapped.registrationDate) return { ok: false, error: "Missing registration date" };
  const registrationDate = new Date(mapped.registrationDate);
  if (Number.isNaN(registrationDate.getTime())) {
    return { ok: false, error: `"Registration date" is not a valid date, got "${mapped.registrationDate}"` };
  }

  if (!mapped.valueRupees) return { ok: false, error: "Missing transaction value" };
  const valueRupees = Number(mapped.valueRupees);
  if (Number.isNaN(valueRupees) || valueRupees <= 0) {
    return { ok: false, error: `"Value" must be a positive number, got "${mapped.valueRupees}"` };
  }

  let carpetSqft: number | undefined;
  if (mapped.carpetSqft) {
    const n = Number(mapped.carpetSqft);
    if (Number.isNaN(n) || n <= 0) return { ok: false, error: `"Carpet sqft" must be a positive number, got "${mapped.carpetSqft}"` };
    carpetSqft = n;
  }

  let bedrooms: number | undefined;
  if (mapped.bedrooms) {
    const n = Number(mapped.bedrooms);
    if (Number.isNaN(n) || n < 0) return { ok: false, error: `"Bedrooms" must be a non-negative number, got "${mapped.bedrooms}"` };
    bedrooms = n;
  }

  // Confidence is optional and never blocks staging (the schema itself
  // defaults to MEDIUM) -- an unrecognized value is simply ignored rather
  // than rejecting an otherwise-valid row, mirroring category's leniency
  // in validateProjectRow.ts rather than status's strict rejection.
  const confidence = mapped.confidence
    ? (CONFIDENCE_LEVELS.find((c) => c === normalizeLabel(mapped.confidence).toUpperCase()) as Confidence | undefined)
    : undefined;

  return {
    ok: true,
    data: {
      localityName,
      projectName: mapped.projectName || undefined,
      type,
      registrationDate,
      valueRupees,
      carpetSqft,
      bedrooms,
      tower: mapped.tower || undefined,
      unitLabel: mapped.unitLabel || undefined,
      registrationNumber: mapped.registrationNumber || undefined,
      confidence,
      sourceNote: mapped.sourceNote || undefined,
    },
  };
}
