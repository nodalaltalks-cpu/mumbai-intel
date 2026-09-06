import type { ProjectReviewSnapshot } from "@/lib/actions/enrichment";
import type { ReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ApprovalReadinessResult } from "@/lib/ingestion/projectApprovalReadiness";
import type { EnrichmentBadgeInfo } from "./enrichmentSummary";

/**
 * Targeted fix (real-time Review Queue synchronization) -- the pure merge
 * step behind ReviewQueueList's card display. Extracted out of that
 * component (rather than left inline) so it can be unit-tested under plain
 * Node/vitest without needing a React/Next client-component environment
 * (this repo has none -- see ProjectForm.test.ts's own note on that), the
 * same way the rest of this codebase tests logic separately from rendering.
 *
 * `overrides` holds one ProjectReviewSnapshot per staging record id, set by
 * ReviewQueueList right after a successful Accept/Edit/Reject/Undo/Enrich
 * mutation (see lib/actions/enrichment.ts's own doc comment on
 * ProjectReviewSnapshot). A record with no override is returned unchanged;
 * a record WITH one has its completeness/badge/outstanding/readiness
 * replaced by the snapshot's values -- always the full replacement, never a
 * partial/manual recount, so the card only ever shows a value the server
 * itself already computed the same way it computes every other card.
 */
export interface ReviewSnapshotFields {
  completeness: ReviewCompleteness | null;
  enrichmentBadge: EnrichmentBadgeInfo | null;
  enrichmentOutstanding: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT"> | null;
  readiness: ApprovalReadinessResult | null;
}

export function applyReviewSnapshotOverrides<T extends { id: string } & ReviewSnapshotFields>(
  records: T[],
  overrides: Record<string, ProjectReviewSnapshot>
): T[] {
  return records.map((record) => {
    const snapshot = overrides[record.id];
    if (!snapshot) return record;
    return {
      ...record,
      completeness: snapshot.completeness,
      enrichmentBadge: snapshot.enrichmentBadge,
      enrichmentOutstanding: snapshot.enrichmentOutstanding,
      readiness: snapshot.readiness,
    };
  });
}
