import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResearchEventType } from "@prisma/client";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export interface EventTypeCount {
  eventType: ResearchEventType;
  count: number;
}

/** Counts every ResearchEventType at least once, even zero-count ones, so the dashboard never silently drops a row. */
export async function getEventTypeCounts(): Promise<EventTypeCount[]> {
  const rows = await prisma.researchEvent.findMany({ select: { eventType: true } });
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

/** Top-viewed Projects/Builders/Localities by their VIEWED event count — event rows grouped in JS (Neon HTTP adapter groupBy avoidance, same pattern as lib/analytics/brochure-queries.ts), then names resolved in one follow-up query. */
async function getTopViewed(
  eventType: "PROJECT_VIEWED" | "BUILDER_VIEWED" | "LOCALITY_VIEWED",
  limit: number
): Promise<TopViewedEntity[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType, entityId: { not: null } },
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

export async function getTopViewedProjects(limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("PROJECT_VIEWED", limit);
}
export async function getTopViewedBuilders(limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("BUILDER_VIEWED", limit);
}
export async function getTopViewedLocalities(limit = 10): Promise<TopViewedEntity[]> {
  return getTopViewed("LOCALITY_VIEWED", limit);
}

export interface ResearchActivitySummary {
  totalEvents: number;
  eventsToday: number;
  searchesPerformed: number;
  filtersUsed: number;
  compareUsed: number;
  wishlistAdded: number;
  continueResearchClicks: number;
}

export async function getResearchActivitySummary(): Promise<ResearchActivitySummary> {
  const now = new Date();
  const [totalEvents, eventsToday, searchesPerformed, filtersUsed, compareUsed, wishlistAdded, continueResearchClicks] = await Promise.all([
    prisma.researchEvent.count(),
    prisma.researchEvent.count({ where: { createdAt: { gte: startOfDay(now) } } }),
    prisma.researchEvent.count({ where: { eventType: "SEARCH_PERFORMED" } }),
    prisma.researchEvent.count({ where: { eventType: "FILTERS_USED" } }),
    prisma.researchEvent.count({ where: { eventType: "COMPARE_USED" } }),
    prisma.researchEvent.count({ where: { eventType: "WISHLIST_ADDED" } }),
    prisma.researchEvent.count({ where: { eventType: "CONTINUE_RESEARCH_CLICKED" } }),
  ]);
  return { totalEvents, eventsToday, searchesPerformed, filtersUsed, compareUsed, wishlistAdded, continueResearchClicks };
}

export interface DailyEventPoint {
  date: string;
  count: number;
}

export async function getEventTrend(days = 30): Promise<DailyEventPoint[]> {
  const since = daysAgo(days - 1);
  const rows = await prisma.researchEvent.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
