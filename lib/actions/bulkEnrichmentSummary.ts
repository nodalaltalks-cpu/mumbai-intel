import type { BulkEnrichmentResult } from "./bulkEnrichment";

/**
 * Phase 46 Part G -- a small, pure rollup of one runBulkEnrichment() result,
 * e.g. "Andheri West — Batch 001 / 10 Projects / 8 enriched / 1 source
 * unavailable / 1 conflict-heavy". Deliberately NOT a batch-analytics
 * dashboard: no persistence, no history, no new table -- just a plain
 * derivation over the result object runBulkEnrichment already returns.
 *
 * Lives outside lib/actions/bulkEnrichment.ts (a "use server" file, where
 * every export must itself be an async Server Action) since this is a plain
 * synchronous helper -- same reason toProjectSchemaInput lives in
 * lib/project-data.ts rather than lib/actions/ingestion.ts.
 *
 * No UI currently calls runBulkEnrichment (Phase 44/45 exercised it only via
 * tests and one-off verification scripts) -- this summarizer is ready for
 * whichever future trigger eventually calls it, not wired into any page yet.
 */
export interface BulkEnrichmentBatchSummary {
  totalProjects: number;
  enrichedCount: number;
  noNewInfoCount: number;
  sourceUnavailableCount: number;
  noSourceCount: number;
  includeFailedCount: number;
  errorCount: number;
  /** Projects where at least one field came back CONFLICT. */
  conflictHeavyCount: number;
  totalConflicts: number;
  totalDurationMs: number;
}

export function summarizeBulkEnrichmentResult(result: BulkEnrichmentResult): BulkEnrichmentBatchSummary {
  const summary: BulkEnrichmentBatchSummary = {
    totalProjects: result.results.length,
    enrichedCount: 0,
    noNewInfoCount: 0,
    sourceUnavailableCount: 0,
    noSourceCount: 0,
    includeFailedCount: 0,
    errorCount: 0,
    conflictHeavyCount: 0,
    totalConflicts: 0,
    totalDurationMs: result.totalDurationMs,
  };
  for (const r of result.results) {
    if (r.status === "SUCCESS") summary.enrichedCount++;
    else if (r.status === "NO_NEW_INFO") summary.noNewInfoCount++;
    else if (r.status === "SOURCE_UNAVAILABLE") summary.sourceUnavailableCount++;
    else if (r.status === "NO_SOURCE") summary.noSourceCount++;
    else if (r.status === "INCLUDE_FAILED") summary.includeFailedCount++;
    else if (r.status === "ERROR") summary.errorCount++;

    if (r.conflict > 0) summary.conflictHeavyCount++;
    summary.totalConflicts += r.conflict;
  }
  return summary;
}

/** Renders the Part G example format as plain text -- no UI framework dependency, usable from a script or a future admin trigger alike. */
export function formatBulkEnrichmentBatchSummary(summary: BulkEnrichmentBatchSummary, label?: string): string {
  const lines: string[] = [];
  if (label) lines.push(label);
  lines.push(`${summary.totalProjects} Projects`);
  if (summary.enrichedCount) lines.push(`${summary.enrichedCount} enriched`);
  if (summary.noNewInfoCount) lines.push(`${summary.noNewInfoCount} no new info`);
  if (summary.sourceUnavailableCount) lines.push(`${summary.sourceUnavailableCount} source unavailable`);
  if (summary.noSourceCount) lines.push(`${summary.noSourceCount} no source`);
  if (summary.includeFailedCount) lines.push(`${summary.includeFailedCount} include failed`);
  if (summary.errorCount) lines.push(`${summary.errorCount} error`);
  if (summary.conflictHeavyCount) lines.push(`${summary.conflictHeavyCount} conflict-heavy`);
  return lines.join("\n");
}
