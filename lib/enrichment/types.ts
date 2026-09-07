/**
 * Generic Project Enrichment Engine — Phase 28.
 *
 * Deliberately reuses the EXISTING 44-field Project completeness registry
 * (lib/ingestion/reviewFieldRegistry.ts's buildProjectReviewCompleteness) as
 * the sole source of truth for which fields exist, their labels, their
 * grouping, and their CURRENT received/missing status -- this module never
 * redefines that field list. Nothing here persists to a database; every
 * output is an in-memory proposal for a human to review.
 */

export type EnrichmentClassification = "CONFIRMED" | "GREEN_NEW" | "YELLOW" | "CONFLICT" | "MISSING" | "FOUNDER_EDITED";

/** Source confidence tier (Phase 26/27 Part D/E) — determines confidence, never authorizes a silent overwrite. */
export type SourceTier = "GOVERNMENT" | "OFFICIAL_DEVELOPER" | "VERIFIED_THIRD_PARTY" | "LISTING_PORTAL";

export const SOURCE_TIER_RANK: Record<SourceTier, number> = {
  GOVERNMENT: 1,
  OFFICIAL_DEVELOPER: 2,
  VERIFIED_THIRD_PARTY: 3,
  LISTING_PORTAL: 4,
};

export const SOURCE_TIER_LABEL: Record<SourceTier, string> = {
  GOVERNMENT: "Government / Regulatory",
  OFFICIAL_DEVELOPER: "Official Developer",
  VERIFIED_THIRD_PARTY: "Verified Third Party",
  LISTING_PORTAL: "Listing Portal",
};

export type EnrichmentConfidence = "High" | "Medium" | "Low";

/**
 * One fact a source adapter found for one field. `value` is a human-readable,
 * already-formatted display string (matching the same formatting convention
 * reviewFieldRegistry.ts's own `field()` helper produces) -- this MVP
 * deliberately compares display strings rather than re-implementing every
 * field's raw-value formatting a second time. `ambiguous` marks a value that
 * should be routed to YELLOW even when the current field is blank (e.g.
 * marketing prose, a "Sales Lounge" address) rather than auto-accepted.
 */
export interface RawSourceFact {
  value: string;
  confidence: EnrichmentConfidence;
  ambiguous?: boolean;
  note?: string;
  /**
   * The real underlying list a source found, for a field the Project
   * registry displays as a count (amenities, images, faqs, etc.) -- e.g. the
   * actual amenity names, not just "14 selected". Optional: `value` alone
   * remains the only thing the UI/classifier ever compares or displays.
   * Phase 32 reads this (when present) so accepting the field can persist
   * the real list rather than a lossy count string into the staging
   * payload's array-shaped fields.
   */
  items?: string[];
}

export type SourceFactsMap = Partial<Record<string, RawSourceFact>>;

export interface SourceMeta {
  url: string;
  tier: SourceTier;
}

/** One row of the enrichment proposal — the shape requested in Phase 28 Part B. */
export interface EnrichmentField {
  key: string;
  label: string;
  group: string;
  currentValue: string | null;
  proposedValue: string | null;
  sourceUrl: string | null;
  sourceType: SourceTier | null;
  confidence: EnrichmentConfidence | null;
  classification: EnrichmentClassification;
  reason: string;
  /** Pass-through of RawSourceFact.items (Phase 32) -- the real list behind a count-displayed field, when the source provided one. */
  proposedItems?: string[];
  /**
   * Targeted fix (Payment Plan editor) -- the real underlying array behind
   * a count-displayed CURRENT value (e.g. "2 plan(s) listed"), for the ONE
   * field key (paymentPlans) whose editor needs to seed from the actual
   * current list rather than just its count string. Only populated for that
   * key; every other array field still has no way to recover its real
   * current items (the same pre-existing limitation as before this fix --
   * deliberately not generalized further, since no other field's editor
   * needs to reconstruct structured entries from it).
   */
  currentItems?: string[];
  /**
   * Targeted fix (founder-edit authority) -- the raw external source value
   * for this field as of THIS run, independent of `proposedValue` (which
   * becomes null once a field is classified FOUNDER_EDITED, so `Edit` seeds
   * from `currentValue` instead of a stale external value). Always exactly
   * what classifyProjectEnrichment's live fact lookup found (or null when no
   * source reported this field at all), so applyFounderEditAuthority -- and
   * the NEXT accept's own "what am I overriding" capture -- always compares
   * against the true current external state, never a value an earlier
   * override already collapsed to null.
   */
  externalValue?: string | null;
  externalItems?: string[];
}

/**
 * Contract a future official-developer (or other Tier 1-3) source connector
 * implements. Phase 28 provides the curated domain registry and ONE
 * fixture-backed implementation (Godrej Sky Shore) proving the shape works —
 * no live network fetch is wired into application code this phase, per the
 * "do not build a giant web scraper" instruction.
 */
export interface OfficialSourceAdapter {
  tier: SourceTier;
  /** Never guesses — returns null when the developer isn't in the curated registry. */
  resolveDomain(developerGroup: string): string | null;
  /** Returns whatever facts were found for a specific project page, already formatted per RawSourceFact's contract. */
  fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap>;
}
