import type { ProjectCardData } from "@/app/components/ProjectCard";

/**
 * Recommendation Engine — Phase 1 foundation (rules + weighted scoring over
 * EXISTING data: UserPreferences, RecentView, SearchHistory, SavedSearch,
 * ResearchEvent, Wishlist, SavedProject). No ML, no new user/analytics
 * tables — see docs/architecture-overview.md and the Recommendation Engine
 * spec, Part 47 (Phase 1: no ML yet).
 */

export type CandidateSource =
  | "PROFILE_MATCH"
  | "RECENT_BEHAVIOR"
  | "SIMILAR_PROJECT"
  | "TRENDING"
  | "NEW"
  | "EXPLORATION";

export interface RecommendationReason {
  /** Human-facing, no ML jargon (Part 46) — e.g. "Within your preferred budget". */
  label: string;
  source: CandidateSource;
}

export interface ScoredProject {
  project: ProjectCardData & { id: string; localityId: string; builderId: string | null };
  score: number;
  reasons: RecommendationReason[];
  sources: CandidateSource[];
}

/**
 * A deterministic snapshot of what a user (or anonymous session) appears to
 * be researching right now — explicit profile fields carry more authority
 * than inferred behavior (Part 33: never silently overwrite explicit
 * preferences), so they're kept in separate fields, not merged into one
 * blob.
 */
export interface UserInterestSnapshot {
  publicUserId: string | null;
  /** Explicit — from UserPreferences. Never overwritten by behavior. */
  explicit: {
    budgetMinRupees: number | null;
    budgetMaxRupees: number | null;
    localityIds: string[];
    categories: string[];
    configurations: string[];
    readiness: string[];
    purposes: string[];
  };
  /** Inferred — recency-weighted counts from RecentView/SearchHistory/ResearchEvent. Influences ranking, never used as a hard filter. */
  inferred: {
    localityWeights: Map<string, number>;
    configurationWeights: Map<string, number>;
    /** Project ids the user has meaningfully engaged with (viewed/saved/compared) — seeds SIMILAR_PROJECT candidates. */
    engagedProjectIds: string[];
    /** Project/entity ids explicitly rejected (removed from wishlist) — negative signal (Part 11). */
    rejectedProjectIds: string[];
  };
  /** Behavioral-state classification (Part 21) — informs which candidate mix to lean on. */
  state: "NEW" | "EXPLORING" | "SHORTLISTING" | "HIGH_INTENT" | "RETURNING";
}
