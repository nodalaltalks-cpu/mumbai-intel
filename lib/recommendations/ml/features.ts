import type { UserInterestSnapshot } from "../types";
import type { CandidateSource } from "../types";

/**
 * Feature extraction — Phase 2, Part 6. Shared by training (lib/recommendations/ml/dataset.ts)
 * and live shadow/active scoring (lib/recommendations/ml/score.ts) so a model is always
 * scored with EXACTLY the same feature logic it was trained on.
 *
 * FEATURE_VERSION must bump whenever this file's feature set or encoding changes —
 * RecommendationModelVersion.featureVersion records which version a given model's
 * weights correspond to (Part 17), so an old model is never silently scored against
 * a changed feature vector.
 *
 * Privacy (Part 24): every feature here is a derived numeric/categorical signal —
 * budget buckets, counts, recency weights, one-hot source flags. Never a raw email,
 * phone, name, or any other directly-identifying value.
 */
export const FEATURE_VERSION = "v1";

export interface ProjectFeatureInput {
  id: string;
  localityId: string;
  priceMinPaise: number | null;
  priceMaxPaise: number | null;
  configurationBedrooms: number[]; // e.g. [2, 3] for a project offering 2 & 3 BHK
  createdAt: Date;
}

export interface CandidateContext {
  source: CandidateSource;
  position: number;
  /** How many total candidates were in the ranked set — normalizes position. */
  totalCandidates: number;
}

const ALL_SOURCES: CandidateSource[] = ["PROFILE_MATCH", "RECENT_BEHAVIOR", "SIMILAR_PROJECT", "TRENDING", "NEW", "EXPLORATION"];

export const FEATURE_NAMES: string[] = [
  "bias_placeholder", // kept out of the weight vector itself (model.ts adds a real bias term) — index 0 reserved for readability in metricsJson dumps only.
  "user_budget_match", // 1 if project price band overlaps explicit budget, 0.5 if unknown, 0 if outside
  "user_locality_weight", // interest-model recency-weighted locality score for this project's locality, normalized 0-1
  "user_configuration_weight", // recency-weighted configuration-interest score, normalized 0-1
  "user_has_explicit_profile", // 1 if UserPreferences exists with any field set
  "user_engagement_count_norm", // engaged project count / 10, capped at 1 — proxy for how much behavioral signal exists for this user
  "project_freshness_days_inv", // 1 / (1 + days since created) — newer projects score higher
  "project_price_known", // 1 if the project has price data at all
  "candidate_position_norm", // 1 - (position / totalCandidates) — earlier positions score higher
  ...ALL_SOURCES.map((s) => `source_${s.toLowerCase()}`), // one-hot candidate source
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function budgetMatchScore(project: ProjectFeatureInput, interest: UserInterestSnapshot): number {
  const { budgetMinRupees, budgetMaxRupees } = interest.explicit;
  if (budgetMinRupees === null && budgetMaxRupees === null) return 0.5; // unknown — neutral, not penalized
  if (project.priceMinPaise === null && project.priceMaxPaise === null) return 0.5;
  const projMinRupees = project.priceMinPaise !== null ? project.priceMinPaise / 100 : null;
  const projMaxRupees = project.priceMaxPaise !== null ? project.priceMaxPaise / 100 : null;
  const withinMax = budgetMaxRupees === null || projMinRupees === null || projMinRupees <= budgetMaxRupees;
  const withinMin = budgetMinRupees === null || projMaxRupees === null || projMaxRupees >= budgetMinRupees;
  return withinMax && withinMin ? 1 : 0;
}

function normalizedWeight(weights: Map<string, number>, key: string): number {
  if (weights.size === 0) return 0;
  const value = weights.get(key) ?? 0;
  const max = Math.max(...weights.values());
  return max > 0 ? clamp01(value / max) : 0;
}

/** Builds the numeric feature vector for one (user context, project, candidate context) triple — the unit both training and inference score. */
export function buildFeatureVector(project: ProjectFeatureInput, interest: UserInterestSnapshot, context: CandidateContext): number[] {
  const hasExplicitProfile =
    interest.explicit.budgetMinRupees !== null ||
    interest.explicit.budgetMaxRupees !== null ||
    interest.explicit.localityIds.length > 0 ||
    interest.explicit.categories.length > 0 ||
    interest.explicit.configurations.length > 0;

  const configMatchScore = project.configurationBedrooms.reduce(
    (max, bedrooms) => Math.max(max, normalizedWeight(interest.inferred.configurationWeights, String(Math.floor(bedrooms)))),
    0
  );

  const freshnessDays = Math.max(0, (Date.now() - project.createdAt.getTime()) / 86_400_000);

  const sourceOneHot = ALL_SOURCES.map((s) => (s === context.source ? 1 : 0));

  return [
    1, // bias_placeholder (unused by model.ts — real bias is a separate scalar)
    budgetMatchScore(project, interest),
    normalizedWeight(interest.inferred.localityWeights, project.localityId),
    configMatchScore,
    hasExplicitProfile ? 1 : 0,
    clamp01(interest.inferred.engagedProjectIds.length / 10),
    1 / (1 + freshnessDays),
    project.priceMinPaise !== null || project.priceMaxPaise !== null ? 1 : 0,
    context.totalCandidates > 0 ? clamp01(1 - context.position / context.totalCandidates) : 0.5,
    ...sourceOneHot,
  ];
}
