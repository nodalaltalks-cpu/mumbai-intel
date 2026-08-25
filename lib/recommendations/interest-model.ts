import type { UserInterferenceInput } from "./types-internal";
import type { UserInterestSnapshot } from "./types";

/**
 * Pure calculator — takes already-fetched data, never queries the database
 * itself (same discipline as lib/analytics/*, see
 * docs/architecture-overview.md's Analytics Engine section). Deterministic,
 * rule-based scoring for Phase 1 (Part 13 of the spec's implementation
 * phases) — no ML.
 */

const HALF_LIFE_DAYS = 14; // a view from 14 days ago counts half as much as one from today

function recencyWeight(when: Date, now: number): number {
  const ageDays = Math.max(0, (now - when.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function addWeight(map: Map<string, number>, key: string | null | undefined, weight: number) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}

function classifyState(input: UserInterferenceInput): UserInterestSnapshot["state"] {
  const { recentViewedProjects, savedProjectIds, compareEventProjectIds, isReturningVisitor } = input;
  const engagementCount = recentViewedProjects.length + savedProjectIds.length + compareEventProjectIds.length;

  if (engagementCount === 0) return "NEW";
  if (savedProjectIds.length > 0 && compareEventProjectIds.length > 0) return "HIGH_INTENT";
  if (savedProjectIds.length > 0 || compareEventProjectIds.length > 0) return "SHORTLISTING";
  if (isReturningVisitor) return "RETURNING";
  return "EXPLORING";
}

export function buildUserInterestSnapshot(input: UserInterferenceInput): UserInterestSnapshot {
  const now = Date.now();
  const localityWeights = new Map<string, number>();
  const configurationWeights = new Map<string, number>();
  const engagedProjectIds = new Set<string>();

  for (const view of input.recentViewedProjects) {
    const weight = recencyWeight(view.viewedAt, now);
    addWeight(localityWeights, view.localityId, weight);
    for (const bedrooms of view.bedroomsList) addWeight(configurationWeights, String(bedrooms), weight);
    engagedProjectIds.add(view.projectId);
  }

  // Saved/compared projects are a STRONGER signal than a plain view (Part 10:
  // "save -> compare -> revisit -> enquiry" outweighs a single click) — 3x
  // weight, recency-decayed from "now" since we don't retain a separate
  // saved/compared timestamp history per project here (SavedProject.id
  // ordering isn't a timestamp) — treated as fresh, on the reasoning that a
  // currently-saved project is, by definition, a currently-held preference.
  for (const projectId of input.savedProjectIds) engagedProjectIds.add(projectId);
  for (const projectId of input.compareEventProjectIds) engagedProjectIds.add(projectId);

  return {
    publicUserId: input.publicUserId,
    explicit: {
      budgetMinRupees: input.preferences?.preferredBudgetMinRupees ?? null,
      budgetMaxRupees: input.preferences?.preferredBudgetMaxRupees ?? null,
      localityIds: input.preferences?.preferredLocalityIds ?? [],
      categories: input.preferences?.preferredCategories ?? [],
      configurations: input.preferences?.preferredConfigurations ?? [],
      readiness: input.preferences?.preferredReadiness ?? [],
      purposes: input.preferences?.purposes ?? [],
    },
    inferred: {
      localityWeights,
      configurationWeights,
      engagedProjectIds: [...engagedProjectIds],
      // Phase 1: no reject/hide UI exists yet (Part 34 is explicitly a FUTURE
      // "where practical" ask) — always empty today, wired for Phase 2.
      rejectedProjectIds: [],
    },
    state: classifyState(input),
  };
}
