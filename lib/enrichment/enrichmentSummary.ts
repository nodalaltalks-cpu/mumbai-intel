import type { EnrichmentClassification, EnrichmentField } from "./types";

/**
 * Phase 46 -- the persisted, at-a-glance enrichment status for one Project
 * staging record. Deliberately NOT a copy of the full proposal (Part C):
 * this never stores currentValue/proposedValue/reason/confidence, only which
 * field keys still have an outstanding GREEN_NEW/YELLOW/CONFLICT proposal
 * from the most recent run. The staging record's own `payload` remains the
 * only source of truth for accepted values; this is pure summary metadata
 * living alongside it under `payload.enrichmentSummary`, ignored by
 * `toProjectSchemaInput` (an explicit field-by-field mapper that only reads
 * named ProjectImportPayload keys) and by the review-field registry (which
 * validates fieldKey against its own known-field list), so it can never leak
 * into the live Project row or be mistaken for a real project field.
 */
export type ProjectEnrichmentStatus = "NOT_RUN" | "READY" | "NO_NEW_INFO" | "NO_SOURCE" | "SOURCE_UNAVAILABLE" | "ERROR";

export interface ProjectEnrichmentSummary {
  status: ProjectEnrichmentStatus;
  /** ISO timestamp of the run that produced this summary. */
  lastRunAt: string;
  sourceUrl?: string;
  /** fieldKey -> classification, only for fields still outstanding (not yet Accepted or Undone since this run). */
  outstanding: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT">;
}

const OUTSTANDING_CLASSIFICATIONS = new Set<EnrichmentClassification>(["GREEN_NEW", "YELLOW", "CONFLICT"]);

/** Builds a fresh summary from one enrichProjectAction run's already-mapped status and field list. Overwrites whatever summary existed before -- a new run is always the newest truth. */
export function buildEnrichmentSummary(status: ProjectEnrichmentStatus, fields: EnrichmentField[] | undefined): ProjectEnrichmentSummary {
  const outstanding: ProjectEnrichmentSummary["outstanding"] = {};
  for (const f of fields ?? []) {
    if (OUTSTANDING_CLASSIFICATIONS.has(f.classification)) {
      outstanding[f.key] = f.classification as "GREEN_NEW" | "YELLOW" | "CONFLICT";
    }
  }
  return {
    status,
    lastRunAt: new Date().toISOString(),
    sourceUrl: fields?.find((f) => f.sourceUrl)?.sourceUrl ?? undefined,
    outstanding,
  };
}

/** Reads the summary back off a staging payload -- null when enrichment has never run for this record (NOT_RUN is derived from absence, never stored explicitly). */
export function readEnrichmentSummary(payload: unknown): ProjectEnrichmentSummary | null {
  const raw = (payload as Record<string, unknown> | null | undefined)?.enrichmentSummary;
  if (!raw || typeof raw !== "object") return null;
  return raw as ProjectEnrichmentSummary;
}

/**
 * Marks one field as no longer outstanding -- called after BOTH Accept and
 * Undo succeed, since either action means the founder just acted on this
 * field. Deliberately does not try to guess whether the field is now
 * "resolved" vs "restored to still-conflicting" (Part J: no complex state
 * machine) -- the summary only ever reflects the last EXPLICIT Enrich run;
 * re-running Enrich is how the founder gets the current live truth again.
 */
export function withFieldTouched(payload: Record<string, unknown>, fieldKey: string): Record<string, unknown> {
  const summary = readEnrichmentSummary(payload);
  if (!summary || !(fieldKey in summary.outstanding)) return payload;
  const outstanding = { ...summary.outstanding };
  delete outstanding[fieldKey];
  return { ...payload, enrichmentSummary: { ...summary, outstanding } };
}

export interface EnrichmentBadgeInfo {
  status: ProjectEnrichmentStatus;
  /** Count of fields still outstanding (GREEN_NEW + YELLOW + CONFLICT) from the last run. */
  proposedCount: number;
  conflictCount: number;
  lastRunAt: string | null;
}

/** Read-only, synchronous, no network/DB access -- safe to call once per row when rendering the Review Queue (Part N: never re-fetches a live source). */
export function deriveEnrichmentBadge(payload: unknown): EnrichmentBadgeInfo {
  const summary = readEnrichmentSummary(payload);
  if (!summary) return { status: "NOT_RUN", proposedCount: 0, conflictCount: 0, lastRunAt: null };
  const values = Object.values(summary.outstanding);
  return {
    status: summary.status,
    proposedCount: values.length,
    conflictCount: values.filter((v) => v === "CONFLICT").length,
    lastRunAt: summary.lastRunAt,
  };
}
