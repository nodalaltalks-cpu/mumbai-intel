import "server-only";
import { prisma } from "@/lib/prisma";
import { buildUserInterestSnapshot } from "./interest-model";
import type { UserInterferenceInput } from "./types-internal";
import { explorationCandidates, newCandidates, profileMatchCandidates, recentBehaviorCandidates, similarProjectCandidates, trendingCandidates, type RawCandidate } from "./candidates";
import { rankAndDiversify } from "./rank";
import type { ScoredProject, UserInterestSnapshot } from "./types";

/**
 * Fetches everything buildUserInterestSnapshot needs for a signed-in user.
 * publicUserId-keyed tables only (UserPreferences/RecentView/SavedProject) —
 * there is no anonymous-session equivalent of any of them today, so an
 * anonymous visitor always gets the cold-start path below, honestly (not
 * approximated from their anon session id).
 */
async function loadInterestInput(publicUserId: string | null): Promise<UserInterferenceInput> {
  if (!publicUserId) {
    return { publicUserId: null, preferences: null, recentViewedProjects: [], savedProjectIds: [], compareEventProjectIds: [], isReturningVisitor: false };
  }

  // Sequential, not Promise.all — the Neon HTTP adapter measurably degrades
  // under concurrent bursts on this app (see app/page.tsx's own documented
  // finding); a handful of small, cheap queries in sequence has been the
  // established, faster pattern here.
  const preferences = await prisma.userPreferences.findUnique({ where: { publicUserId } });
  const recentViews = await prisma.recentView.findMany({
    where: { publicUserId, entityType: "Project" },
    orderBy: { viewedAt: "desc" },
    take: 20,
  });
  const savedProjects = await prisma.savedProject.findMany({ where: { publicUserId }, select: { projectId: true } });
  const compareEvents = await prisma.researchEvent.findMany({
    where: { publicUserId, eventType: "COMPARE_USED", entityType: "Project", entityId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { entityId: true },
  });

  const viewedProjectIds = recentViews.map((v) => v.entityId);
  const projectDetails = viewedProjectIds.length
    ? await prisma.project.findMany({ where: { id: { in: viewedProjectIds } }, select: { id: true, localityId: true, configurations: { select: { bedrooms: true } } } })
    : [];
  const detailsById = new Map(projectDetails.map((p) => [p.id, p]));

  const recentViewedProjects = recentViews
    .map((v) => {
      const detail = detailsById.get(v.entityId);
      if (!detail) return null;
      return {
        projectId: v.entityId,
        localityId: detail.localityId,
        bedroomsList: detail.configurations.map((c) => Math.floor(Number(c.bedrooms))),
        viewedAt: v.viewedAt,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    publicUserId,
    preferences,
    recentViewedProjects,
    savedProjectIds: savedProjects.map((s) => s.projectId),
    compareEventProjectIds: compareEvents.map((e) => e.entityId).filter((id): id is string => id !== null),
    // "Returning" here just means the visitor has any prior tracked
    // engagement at all — a coarse Part 21 proxy, not a session-count model.
    isReturningVisitor: recentViews.length > 0,
  };
}

export interface RecommendationSet {
  items: ScoredProject[];
  interestState: UserInterestSnapshot["state"];
  /** True when this list is the cold-start (no profile, no behavior) fallback — surfaced so the UI can label it "Popular right now" instead of implying real personalization. */
  isColdStart: boolean;
}

/**
 * The one orchestration entry point every frontend surface calls (Part 2 of
 * the spec's architecture: CANDIDATE GENERATION -> FILTERING -> RANKING ->
 * DIVERSIFICATION -> EXPLORATION -> FINAL RECOMMENDATIONS). Cold start
 * (Part 19): no profile + no behavior falls back to trending + new only.
 */
export async function getRecommendationsForUser(publicUserId: string | null, limit = 8): Promise<RecommendationSet> {
  const input = await loadInterestInput(publicUserId);
  const interest = buildUserInterestSnapshot(input);
  const isColdStart = interest.state === "NEW";

  const excludeIds = [...interest.inferred.engagedProjectIds];
  const pool: RawCandidate[] = [];

  if (isColdStart) {
    pool.push(...(await trendingCandidates(excludeIds, 10)));
    pool.push(...(await newCandidates([...excludeIds, ...pool.map((c) => c.project.id)], 10)));
  } else {
    pool.push(...(await profileMatchCandidates(interest, excludeIds, 10)));
    pool.push(...(await recentBehaviorCandidates(interest, [...excludeIds, ...pool.map((c) => c.project.id)], 8)));
    pool.push(...(await similarProjectCandidates(interest, [...excludeIds, ...pool.map((c) => c.project.id)], 8)));
    pool.push(...(await trendingCandidates([...excludeIds, ...pool.map((c) => c.project.id)], 6)));
    pool.push(...(await newCandidates([...excludeIds, ...pool.map((c) => c.project.id)], 4)));
  }
  pool.push(...(await explorationCandidates(interest, [...excludeIds, ...pool.map((c) => c.project.id)], 3)));

  const items = rankAndDiversify(pool, limit);
  return { items, interestState: interest.state, isColdStart };
}

/** Project-detail-page "You may also consider" — seeded from ONE project (the one being viewed), not the visitor's whole history. Distinct from the existing "Nearby Projects" (getRelatedProjects, locality/builder only) — this adds price-band awareness and a human reason. */
export async function getSimilarToProject(project: { id: string; localityId: string; builderId: string | null }, limit = 4): Promise<ScoredProject[]> {
  const fakeSnapshot: UserInterestSnapshot = {
    publicUserId: null,
    explicit: { budgetMinRupees: null, budgetMaxRupees: null, localityIds: [], categories: [], configurations: [], readiness: [], purposes: [] },
    inferred: { localityWeights: new Map(), configurationWeights: new Map(), engagedProjectIds: [project.id], rejectedProjectIds: [] },
    state: "EXPLORING",
  };
  const candidates = await similarProjectCandidates(fakeSnapshot, [project.id], limit * 2);
  return rankAndDiversify(candidates, limit, { maxPerLocality: 2, minExplorationSlots: 0 });
}
