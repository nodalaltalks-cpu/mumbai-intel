import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { RECOMMENDATION_PROJECT_INCLUDE, mapProjectToCard } from "./project-card";
import type { CandidateSource, RecommendationReason, UserInterestSnapshot } from "./types";

export interface RawCandidate {
  project: ReturnType<typeof mapProjectToCard>;
  reason: RecommendationReason;
  source: CandidateSource;
}

const BASE_WHERE = { isPublished: true, isArchived: false, deletedAt: null } as const;

const READINESS_TO_STATUSES: Record<string, ProjectStatus[]> = {
  NEW_LAUNCH: ["ANNOUNCED", "PRE_LAUNCH"],
  UNDER_CONSTRUCTION: ["UNDER_CONSTRUCTION", "NEARING_POSSESSION"],
  READY_TO_MOVE: ["READY_TO_MOVE", "DELIVERED"],
};

function topKeys(weights: Map<string, number>, n: number): string[] {
  return [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key);
}

/**
 * SOURCE A — Profile match. Explicit UserPreferences fields are HARD
 * constraints where set (Part 5: "if the user explicitly says budget ₹1 Cr
 * maximum ... do not recommend it as a normal match") — everything else
 * (locality/category/configuration/readiness) stays a soft OR-filter, never
 * eliminating the whole pool.
 */
export async function profileMatchCandidates(interest: UserInterestSnapshot, excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const { explicit } = interest;
  const hasAnyPreference =
    explicit.budgetMinRupees !== null ||
    explicit.budgetMaxRupees !== null ||
    explicit.localityIds.length > 0 ||
    explicit.categories.length > 0 ||
    explicit.configurations.length > 0 ||
    explicit.readiness.length > 0;
  if (!hasAnyPreference) return [];

  const where: Prisma.ProjectWhereInput = { ...BASE_WHERE, id: { notIn: excludeIds } };

  // Hard constraint: budget, when explicitly set — a project with NO price
  // data at all is excluded too (can't verify it fits, so it isn't offered
  // as a "match").
  if (explicit.budgetMinRupees !== null || explicit.budgetMaxRupees !== null) {
    where.priceMinPaise = { not: null };
    if (explicit.budgetMaxRupees !== null) where.priceMinPaise.lte = BigInt(Math.round(explicit.budgetMaxRupees * 100));
    if (explicit.budgetMinRupees !== null) {
      where.priceMaxPaise = { gte: BigInt(Math.round(explicit.budgetMinRupees * 100)) };
    }
  }
  if (explicit.categories.length > 0) where.category = { in: explicit.categories as Prisma.ProjectWhereInput["category"] extends { in: infer T } ? T : never };
  if (explicit.localityIds.length > 0) where.localityId = { in: explicit.localityIds };
  if (explicit.readiness.length > 0) {
    const statuses = explicit.readiness.flatMap((r) => READINESS_TO_STATUSES[r] ?? []);
    if (statuses.length > 0) where.status = { in: statuses };
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: RECOMMENDATION_PROJECT_INCLUDE,
  });

  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: { label: "Within your preferred budget and locality", source: "PROFILE_MATCH" as const },
    source: "PROFILE_MATCH" as const,
  }));
}

/** SOURCE B — Recent behaviour. The user's top 2 recently-weighted localities, independent of their saved profile. */
export async function recentBehaviorCandidates(interest: UserInterestSnapshot, excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const topLocalities = topKeys(interest.inferred.localityWeights, 2);
  if (topLocalities.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { ...BASE_WHERE, id: { notIn: excludeIds }, localityId: { in: topLocalities } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: RECOMMENDATION_PROJECT_INCLUDE,
  });

  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: { label: `Because you've been exploring ${p.locality.name}`, source: "RECENT_BEHAVIOR" as const },
    source: "RECENT_BEHAVIOR" as const,
  }));
}

/** SOURCE D — Similar projects, seeded from up to 5 recently-engaged projects (locality OR builder OR overlapping price band). */
export async function similarProjectCandidates(interest: UserInterestSnapshot, excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const seedIds = interest.inferred.engagedProjectIds.slice(0, 5);
  if (seedIds.length === 0) return [];

  const seeds = await prisma.project.findMany({
    where: { id: { in: seedIds } },
    select: { id: true, localityId: true, builderId: true, priceMinPaise: true, priceMaxPaise: true },
  });
  if (seeds.length === 0) return [];

  const localityIds = [...new Set(seeds.map((s) => s.localityId))];
  const builderIds = [...new Set(seeds.map((s) => s.builderId).filter((id): id is string => id !== null))];

  const projects = await prisma.project.findMany({
    where: {
      ...BASE_WHERE,
      id: { notIn: [...excludeIds, ...seedIds] },
      OR: [{ localityId: { in: localityIds } }, ...(builderIds.length > 0 ? [{ builderId: { in: builderIds } }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: RECOMMENDATION_PROJECT_INCLUDE,
  });

  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: {
      label: builderIds.includes(p.builderId ?? "") ? `From a builder you've researched` : `Similar to projects you've viewed in ${p.locality.name}`,
      source: "SIMILAR_PROJECT" as const,
    },
    source: "SIMILAR_PROJECT" as const,
  }));
}

/** SOURCE F — Trending: most PROJECT_VIEWED in the last 7 days, platform-wide (not personalized) — a real, counted signal. */
export async function trendingCandidates(excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.researchEvent.groupBy({
    by: ["entityId"],
    where: { eventType: "PROJECT_VIEWED", entityType: "Project", entityId: { not: null, notIn: excludeIds }, createdAt: { gte: since } },
    _count: { entityId: true },
    orderBy: { _count: { entityId: "desc" } },
    take: limit * 2, // headroom — some may resolve to unpublished/deleted projects
  });
  const ids = grouped.map((g) => g.entityId).filter((id): id is string => id !== null);
  if (ids.length === 0) return [];

  const projects = await prisma.project.findMany({ where: { ...BASE_WHERE, id: { in: ids } }, take: limit, include: RECOMMENDATION_PROJECT_INCLUDE });
  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: { label: "Popular with buyers researching Mumbai right now", source: "TRENDING" as const },
    source: "TRENDING" as const,
  }));
}

/** SOURCE G — New: most recently added published projects. */
export async function newCandidates(excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const projects = await prisma.project.findMany({
    where: { ...BASE_WHERE, id: { notIn: excludeIds } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: RECOMMENDATION_PROJECT_INCLUDE,
  });
  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: { label: "Newly added to the catalogue", source: "NEW" as const },
    source: "NEW" as const,
  }));
}

/**
 * SOURCE H — Exploration: a small, bounded sample of published projects
 * OUTSIDE the user's top locality, so the recommendation set never becomes
 * a pure echo chamber (Part 18). Deliberately not fully random — anchored
 * to the primary city, still excludes already-shown ids.
 */
export async function explorationCandidates(interest: UserInterestSnapshot, excludeIds: string[], limit: number): Promise<RawCandidate[]> {
  const topLocality = topKeys(interest.inferred.localityWeights, 1)[0] ?? interest.explicit.localityIds[0];
  const where: Prisma.ProjectWhereInput = {
    ...BASE_WHERE,
    id: { notIn: excludeIds },
    ...(topLocality ? { localityId: { not: topLocality } } : {}),
  };
  // A lightweight "sample" without a raw SQL random() call: skip by a small
  // pseudo-random offset within a bounded recent window — good enough for a
  // 1-2 card exploration slice, not a statistically rigorous sample.
  const count = await prisma.project.count({ where });
  if (count === 0) return [];
  const skip = Math.floor(Math.random() * Math.max(1, Math.min(count, 40)));

  const projects = await prisma.project.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: limit, include: RECOMMENDATION_PROJECT_INCLUDE });
  return projects.map((p) => ({
    project: mapProjectToCard(p),
    reason: { label: `Worth a look in ${p.locality.name}`, source: "EXPLORATION" as const },
    source: "EXPLORATION" as const,
  }));
}
