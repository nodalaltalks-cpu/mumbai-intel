import type { ApprovalReadinessResult } from "@/lib/ingestion/projectApprovalReadiness";
import type { EnrichmentBadgeInfo } from "./enrichmentSummary";
import type { ProjectResearchActivity } from "./researchAttribution";

/**
 * Founder Review Queue — Search + Agent Change Visibility (Part 1/2/8).
 *
 * Pure, dependency-free filter/search predicates over the SAME
 * already-loaded Review Queue records ReviewQueueList.tsx renders (no new
 * fetch, no search engine, no second database) -- kept in their own plain
 * module (not inlined in that "use client" component) specifically so they
 * can be unit-tested directly: this repo's component tests are all
 * source-inspection only (no jsdom/React Testing Library environment -- see
 * EnrichmentProposalPanel.test.ts's own note), because importing a "use
 * client"/"use server"-laden component module in plain Node isn't safe. This
 * module imports neither, so a real `import`+call unit test is both possible
 * and far more reliable than regex-matching JSX source for logic this
 * central to what the founder sees.
 *
 * Deliberately structural (not `Pick<ReviewRecord, ...>`) to avoid a
 * circular import with ReviewQueueList.tsx, which imports THIS module for
 * its filter logic -- any object shaped like this (which every real
 * ReviewRecord already is) satisfies it.
 */
export interface FilterableReviewRecord {
  enrichmentBadge: EnrichmentBadgeInfo | null;
  readiness: ApprovalReadinessResult | null;
  researchActivity: ProjectResearchActivity | null;
  localityName: string | null;
  developerName: string | null;
  searchableText: string | null;
}

export type StatusFilter = "ALL" | "PENDING" | "CONFLICTS" | "NOT_ENRICHED" | "APPROVAL_READY";
export type ResearchStatusFilter = "ALL" | "RESEARCHED" | "NOT_RESEARCHED" | "HAS_CHANGES" | "HAS_CONFLICTS";
export type OriginFilter = "ALL" | "ORIGINAL_INGESTION" | "AUTOMATIC_ENRICHMENT" | "RESEARCH" | "FOUNDER_EDITED";

export function matchesStatusFilter(record: FilterableReviewRecord, filter: StatusFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "APPROVAL_READY") return record.readiness?.status === "READY";
  const badge = record.enrichmentBadge;
  if (!badge) return false;
  if (filter === "PENDING") return badge.status === "READY" && badge.proposedCount > 0;
  if (filter === "CONFLICTS") return badge.conflictCount > 0;
  return badge.status === "NOT_RUN"; // NOT_ENRICHED
}

export function matchesResearchStatusFilter(record: FilterableReviewRecord, filter: ResearchStatusFilter): boolean {
  if (filter === "ALL") return true;
  const activity = record.researchActivity;
  if (filter === "NOT_RESEARCHED") return !activity?.hasResearch;
  if (!activity?.hasResearch) return false;
  if (filter === "RESEARCHED") return true;
  if (filter === "HAS_CHANGES") return activity.accepted > 0 || activity.founderEdited > 0;
  return activity.conflicts > 0; // HAS_CONFLICTS
}

/** Part 3's four project-level origins are not mutually exclusive (a project can be both automatically enriched AND founder-edited) -- this filter shows "does this origin apply at all", not "is this the ONLY origin". */
export function matchesOriginFilter(record: FilterableReviewRecord, filter: OriginFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "ORIGINAL_INGESTION") return (record.enrichmentBadge?.status ?? "NOT_RUN") === "NOT_RUN" && !record.researchActivity?.hasResearch;
  if (filter === "AUTOMATIC_ENRICHMENT") return (record.enrichmentBadge?.status ?? "NOT_RUN") !== "NOT_RUN";
  if (filter === "RESEARCH") return Boolean(record.researchActivity?.hasResearch);
  return Boolean(record.researchActivity?.hasFounderEdit); // FOUNDER_EDITED
}

/** Case-insensitive, spacing-tolerant: collapses runs of whitespace and lowercases, matching the same normalization applied server-side when building each record's `searchableText` (see the Review page's own map()). */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchesSearch(record: FilterableReviewRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return Boolean(record.searchableText?.includes(normalizedQuery));
}

export function matchesAllFilters(
  record: FilterableReviewRecord,
  filters: { search: string; status: StatusFilter; research: ResearchStatusFilter; origin: OriginFilter; locality: string; developer: string }
): boolean {
  return (
    matchesStatusFilter(record, filters.status) &&
    matchesResearchStatusFilter(record, filters.research) &&
    matchesOriginFilter(record, filters.origin) &&
    (!filters.locality || record.localityName === filters.locality) &&
    (!filters.developer || record.developerName === filters.developer) &&
    matchesSearch(record, filters.search)
  );
}
