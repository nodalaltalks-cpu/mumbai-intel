import { formatDate, formatPaise, formatPricePerSqft, formatSqft } from "@/lib/format";
import { CONFIDENCE_LABEL, SOURCE_LABEL, TRANSACTION_TYPE_LABEL, type DataSource } from "@/lib/project-meta";
import type { TransactionImportPayload } from "./connectors/fileImport/types";
import { isMeaningfulValue } from "./reviewFieldRegistry";
import type { FieldStatus, ReviewField, ReviewFieldGroup, ReviewCompleteness } from "./reviewFieldRegistry";

/**
 * Transaction Review Queue "data completeness" engine (Phase 16B) — the
 * Transaction counterpart to lib/ingestion/reviewFieldRegistry.ts's Project
 * registry, kept in a SEPARATE module deliberately: Phase 16B explicitly
 * requires the Transaction denominator to come from Transaction's own field
 * set (16 fields — see TransactionForm.tsx + the `Transaction` model in
 * prisma/schema.prisma), never the Project 44-field registry. Reuses only
 * the shared `isMeaningfulValue` type-respecting rule and the shared
 * Review* types from reviewFieldRegistry.ts -- not its Project field list.
 */

export type { FieldStatus, ReviewField, ReviewFieldGroup, ReviewCompleteness };

function field(key: string, label: string, rawValue: unknown, displayValue: string | null, reviewNote?: string): ReviewField {
  const status: FieldStatus = reviewNote ? "NEEDS_REVIEW" : isMeaningfulValue(rawValue) ? "RECEIVED" : "MISSING";
  return { key, label, status, value: status === "MISSING" ? null : displayValue, reviewNote };
}

function summarize(groups: ReviewFieldGroup[]): ReviewCompleteness {
  const all = groups.flatMap((g) => g.fields);
  return {
    groups,
    totalFields: all.length,
    receivedCount: all.filter((f) => f.status === "RECEIVED").length,
    missingCount: all.filter((f) => f.status === "MISSING").length,
    needsReviewCount: all.filter((f) => f.status === "NEEDS_REVIEW").length,
  };
}

export interface TransactionReviewContext {
  localityName?: string;
  projectName?: string;
  /** Set only when a real possible-duplicate signal exists (see buildTransactionReviewCompleteness's doc comment) -- never fabricated. */
  possibleDuplicateNote?: string;
}

/**
 * Builds the 16-field TRANSACTION / PROPERTY / SOURCE & VERIFICATION
 * breakdown for a Transaction staging candidate. `locality`/`project`/`type`/
 * `registrationDate`/`value`/`carpetSqft`/`bedrooms`/`tower`/`unitLabel`/
 * `dataSource`/`sourceRef`/`confidence`/`sourceNote` are real keys on
 * `TransactionImportPayload` (lib/ingestion/connectors/fileImport/types.ts,
 * extended in Phase 19) and are already populated by the existing
 * runTransactionFileImport(). `builtUpSqft`, `pricePerSqftRupees`, and `floor`
 * are real columns on the `Transaction` model and real fields on
 * TransactionForm.tsx, but are NOT yet part of the staging payload type --
 * read via a raw untyped cast (same pattern as the Project registry) so a
 * future importer extension that DOES populate one of these is picked up
 * automatically rather than hardcoded to always show missing.
 *
 * `possibleDuplicateNote`, when passed, marks the `sourceRef` field
 * NEEDS_REVIEW -- reserved for a real signal only (IngestStagingRecord.
 * matchedExistingId pointing at another still-PENDING Transaction staging
 * record with the same real registration number), never manufactured.
 */
export function buildTransactionReviewCompleteness(
  payload: TransactionImportPayload,
  context: TransactionReviewContext = {}
): ReviewCompleteness {
  const raw = payload as unknown as Record<string, unknown>;
  const { possibleDuplicateNote } = context;

  const transactionGroup: ReviewFieldGroup = {
    key: "transaction",
    label: "Transaction",
    fields: [
      field("locality", "Locality", payload.localityId, context.localityName ?? null),
      field("project", "Project", payload.projectId, context.projectName ?? null),
      field("type", "Type", payload.type, payload.type ? TRANSACTION_TYPE_LABEL[payload.type] : null),
      field(
        "registrationDate",
        "Registration Date",
        payload.registrationDateIso,
        payload.registrationDateIso ? formatDate(payload.registrationDateIso) : null
      ),
      field("value", "Value", payload.valueRupees, payload.valueRupees !== undefined ? formatPaise(payload.valueRupees * 100) : null),
    ],
  };

  const propertyGroup: ReviewFieldGroup = {
    key: "property",
    label: "Property",
    fields: [
      field("carpetSqft", "Carpet Area", payload.carpetSqft, payload.carpetSqft !== undefined ? formatSqft(payload.carpetSqft) : null),
      field("builtUpSqft", "Built-up Area", raw.builtUpSqft, typeof raw.builtUpSqft === "number" ? formatSqft(raw.builtUpSqft) : null),
      field(
        "pricePerSqft",
        "Rate / Sqft",
        raw.pricePerSqftRupees,
        typeof raw.pricePerSqftRupees === "number" ? formatPricePerSqft(raw.pricePerSqftRupees * 100) : null
      ),
      field("bedrooms", "Bedrooms", payload.bedrooms, payload.bedrooms !== undefined ? String(payload.bedrooms) : null),
      field("floor", "Floor", raw.floor, typeof raw.floor === "number" ? String(raw.floor) : null),
      field("tower", "Tower", payload.tower, payload.tower ?? null),
      field("unitLabel", "Unit Label", payload.unitLabel, payload.unitLabel ?? null),
    ],
  };

  const sourceGroup: ReviewFieldGroup = {
    key: "sourceVerification",
    label: "Source & Verification",
    fields: [
      field("sourceRef", "Source Reference", payload.sourceRef, payload.sourceRef ?? null, possibleDuplicateNote),
      field("dataSource", "Data Source", payload.dataSource, payload.dataSource ? SOURCE_LABEL[payload.dataSource as DataSource] : null),
      field("confidence", "Confidence", payload.confidence, payload.confidence ? CONFIDENCE_LABEL[payload.confidence] : null),
      field("sourceNote", "Source Note", payload.sourceNote, payload.sourceNote ?? null),
    ],
  };

  return summarize([transactionGroup, propertyGroup, sourceGroup]);
}
