import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResearchEventType } from "@prisma/client";
import { buildBuckets, countByBucket, type AnalyticsPeriod } from "./period";

export interface EventTypeCount {
  eventType: ResearchEventType;
  count: number;
}

/** Counts every ResearchEventType at least once, even zero-count ones, so the dashboard never silently drops a row. Scoped to the given period. */
export async function getEventTypeCounts(period: AnalyticsPeriod): Promise<EventTypeCount[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { createdAt: { gte: period.since, lt: period.until } },
    select: { eventType: true },
  });
  const counts = new Map<ResearchEventType, number>();
  for (const row of rows) counts.set(row.eventType, (counts.get(row.eventType) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count);
}

export interface TopViewedEntity {
  id: string;
  name: string;
  href: string;
  viewCount: number;
}

/** Top-viewed Projects/Builders/Localities by their VIEWED event count within the period — event rows grouped in JS (Neon HTTP adapter groupBy avoidance, same pattern as lib/analytics/brochure-queries.ts), then names resolved in one follow-up query. */
async function getTopViewed(
  eventType: "PROJECT_VIEWED" | "BUILDER_VIEWED" | "LOCALITY_VIEWED",
  limit: number,
  period: AnalyticsPeriod
): Promise<TopViewedEntity[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType, entityId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
    select: { entityId: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.entityId) continue;
    counts.set(row.entityId, (counts.get(row.entityId) ?? 0) + 1);
  }
  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (topIds.length === 0) return [];

  if (eventType === "PROJECT_VIEWED") {
    const projects = await prisma.project.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true, slug: true } });
    const byId = new Map(projects.map((p) => [p.id, p]));
    return topIds.map((id) => ({ id, name: byId.get(id)?.name ?? "(deleted)", href: `/admin/projects/${id}/edit`, viewCount: counts.get(id) ?? 0 })).filter((r) => byId.has(r.id));
  }
  if (eventType === "BUILDER_VIEWED") {
    const builders = await prisma.builder.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } });
    const byId = new Map(builders.map((b) => [b.id, b]));
    return topIds.map((id) => ({ id, name: byId.get(id)?.name ?? "(deleted)", href: `/admin/builders/${id}/edit`, viewCount: counts.get(id) ?? 0 })).filter((r) => byId.has(r.id));
  }
  const localities = await prisma.locality.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } });
  const byId = new Map(localities.map((l) => [l.id, l]));
  return topIds.map((id) => ({ id, name: byId.get(id)?.name ?? "(deleted)", href: `/admin/localities/${id}/edit`, viewCount: counts.get(id) ?? 0 })).filter((r) => byId.has(r.id));
}

export async function getTopViewedProjects(period: AnalyticsPeriod, limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("PROJECT_VIEWED", limit, period);
}
export async function getTopViewedBuilders(period: AnalyticsPeriod, limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("BUILDER_VIEWED", limit, period);
}
export async function getTopViewedLocalities(period: AnalyticsPeriod, limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("LOCALITY_VIEWED", limit, period);
}

export interface ResearchActivitySummary {
  totalEvents: number;
  previousTotalEvents: number;
  searchesPerformed: number;
  previousSearchesPerformed: number;
  filtersUsed: number;
  compareUsed: number;
  wishlistAdded: number;
  continueResearchClicks: number;
  projectCardClicks: number;
}

/** All counts scoped to the current period, plus the equivalent previous-period totals the page needs for its "vs last period" comparisons (Section 35). projectCardClicks reflects PROJECT_CARD_CLICKED, which nothing in the codebase currently produces -- it will correctly read 0 until a producer exists, never a fabricated number. */
export async function getResearchActivitySummary(period: AnalyticsPeriod): Promise<ResearchActivitySummary> {
  const current = { createdAt: { gte: period.since, lt: period.until } };
  const previous = { createdAt: { gte: period.previousSince, lt: period.previousUntil } };
  const [totalEvents, previousTotalEvents, searchesPerformed, previousSearchesPerformed, filtersUsed, compareUsed, wishlistAdded, continueResearchClicks, projectCardClicks] =
    await Promise.all([
      prisma.researchEvent.count({ where: current }),
      prisma.researchEvent.count({ where: previous }),
      prisma.researchEvent.count({ where: { eventType: "SEARCH_PERFORMED", ...current } }),
      prisma.researchEvent.count({ where: { eventType: "SEARCH_PERFORMED", ...previous } }),
      prisma.researchEvent.count({ where: { eventType: "FILTERS_USED", ...current } }),
      prisma.researchEvent.count({ where: { eventType: "COMPARE_USED", ...current } }),
      prisma.researchEvent.count({ where: { eventType: "WISHLIST_ADDED", ...current } }),
      prisma.researchEvent.count({ where: { eventType: "CONTINUE_RESEARCH_CLICKED", ...current } }),
      prisma.researchEvent.count({ where: { eventType: "PROJECT_CARD_CLICKED", ...current } }),
    ]);
  return {
    totalEvents,
    previousTotalEvents,
    searchesPerformed,
    previousSearchesPerformed,
    filtersUsed,
    compareUsed,
    wishlistAdded,
    continueResearchClicks,
    projectCardClicks,
  };
}

export interface BucketPoint {
  label: string;
  count: number;
}

/** Event volume trend bucketed at the period's chosen granularity (hour/day/week/month — Section 36), instead of a hardcoded 30-day daily loop. */
export async function getEventTrend(period: AnalyticsPeriod): Promise<BucketPoint[]> {
  const rows = await prisma.researchEvent.findMany({ where: { createdAt: { gte: period.since, lt: period.until } }, select: { createdAt: true } });
  const buckets = buildBuckets(period);
  return countByBucket(rows.map((r) => r.createdAt), buckets);
}
