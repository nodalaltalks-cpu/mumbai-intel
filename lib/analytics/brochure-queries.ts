import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * All admin Brochure Analytics reads — every number here is derived from
 * BrochureDownloadEvent rows at query time (group-by/count), never from a
 * maintained counter column, per the "event-sourced, not incremented" design.
 * "Downloads" always means eventType = DOWNLOAD_COMPLETED unless noted.
 */

const DOWNLOAD = "DOWNLOAD_COMPLETED" as const;

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
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export interface BrochureAnalyticsSummary {
  totalDownloads: number;
  downloadsToday: number;
  downloadsThisWeek: number;
  downloadsThisMonth: number;
  downloadsThisYear: number;
  anonymousDownloads: number;
  loggedInDownloads: number;
  returningDownloaders: number;
  totalViews: number;
}

export async function getBrochureAnalyticsSummary(): Promise<BrochureAnalyticsSummary> {
  const now = new Date();
  const [
    totalDownloads,
    downloadsToday,
    downloadsThisWeek,
    downloadsThisMonth,
    downloadsThisYear,
    anonymousDownloads,
    loggedInDownloads,
    returningDownloaders,
    totalViews,
  ] = await Promise.all([
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, createdAt: { gte: startOfDay(now) } } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, createdAt: { gte: daysAgo(7) } } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, createdAt: { gte: startOfMonth(now) } } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, createdAt: { gte: startOfYear(now) } } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, publicUserId: null } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, publicUserId: { not: null } } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: DOWNLOAD, isRepeat: true } }),
    prisma.brochureDownloadEvent.count({ where: { eventType: "VIEWED" } }),
  ]);

  return {
    totalDownloads,
    downloadsToday,
    downloadsThisWeek,
    downloadsThisMonth,
    downloadsThisYear,
    anonymousDownloads,
    loggedInDownloads,
    returningDownloaders,
    totalViews,
  };
}

export interface TopEntityDownloads {
  id: string;
  name: string;
  slug: string | null;
  downloadCount: number;
}

export async function getTopDownloadedProjects(limit = 10): Promise<TopEntityDownloads[]> {
  const grouped = await prisma.brochureDownloadEvent.groupBy({
    by: ["projectId"],
    where: { eventType: DOWNLOAD },
    _count: { _all: true },
    orderBy: { _count: { projectId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const projects = await prisma.project.findMany({ where: { id: { in: grouped.map((g) => g.projectId) } }, select: { id: true, name: true, slug: true } });
  const byId = new Map(projects.map((p) => [p.id, p]));
  return grouped
    .map((g): TopEntityDownloads | null => {
      const p = byId.get(g.projectId);
      if (!p) return null;
      return { id: p.id, name: p.name, slug: p.slug, downloadCount: g._count._all };
    })
    .filter((x): x is TopEntityDownloads => x !== null);
}

export async function getTopDownloadedBuilders(limit = 10): Promise<TopEntityDownloads[]> {
  const grouped = await prisma.brochureDownloadEvent.groupBy({
    by: ["builderId"],
    where: { eventType: DOWNLOAD, builderId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { builderId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const ids = grouped.map((g) => g.builderId).filter((id): id is string => id !== null);
  const builders = await prisma.builder.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
  const byId = new Map(builders.map((b) => [b.id, b]));
  return grouped
    .map((g): TopEntityDownloads | null => {
      const b = g.builderId ? byId.get(g.builderId) : undefined;
      if (!b) return null;
      return { id: b.id, name: b.name, slug: b.slug, downloadCount: g._count._all };
    })
    .filter((x): x is TopEntityDownloads => x !== null);
}

export async function getTopDownloadedLocalities(limit = 10): Promise<TopEntityDownloads[]> {
  const grouped = await prisma.brochureDownloadEvent.groupBy({
    by: ["localityId"],
    where: { eventType: DOWNLOAD, localityId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { localityId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const ids = grouped.map((g) => g.localityId).filter((id): id is string => id !== null);
  const localities = await prisma.locality.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
  const byId = new Map(localities.map((l) => [l.id, l]));
  return grouped
    .map((g): TopEntityDownloads | null => {
      const l = g.localityId ? byId.get(g.localityId) : undefined;
      if (!l) return null;
      return { id: l.id, name: l.name, slug: l.slug, downloadCount: g._count._all };
    })
    .filter((x): x is TopEntityDownloads => x !== null);
}

export async function getTopDownloadedMicroMarkets(limit = 10): Promise<TopEntityDownloads[]> {
  const grouped = await prisma.brochureDownloadEvent.groupBy({
    by: ["microMarketId"],
    where: { eventType: DOWNLOAD, microMarketId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { microMarketId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const ids = grouped.map((g) => g.microMarketId).filter((id): id is string => id !== null);
  const microMarkets = await prisma.microMarket.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const byId = new Map(microMarkets.map((m) => [m.id, m]));
  return grouped
    .map((g): TopEntityDownloads | null => {
      const m = g.microMarketId ? byId.get(g.microMarketId) : undefined;
      if (!m) return null;
      return { id: m.id, name: m.name, slug: null, downloadCount: g._count._all };
    })
    .filter((x): x is TopEntityDownloads => x !== null);
}

export interface DailyDownloadPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

/** Daily download counts for the last `days` days — bucketed in JS since the Neon HTTP adapter has no efficient DATE_TRUNC groupBy path here. */
export async function getDailyDownloadTrend(days = 30): Promise<DailyDownloadPoint[]> {
  const since = daysAgo(days - 1);
  const rows = await prisma.brochureDownloadEvent.findMany({
    where: { eventType: DOWNLOAD, createdAt: { gte: since } },
    select: { createdAt: true },
  });
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

export interface MonthlyDownloadPoint {
  month: string; // YYYY-MM
  count: number;
}

export async function getMonthlyDownloadTrend(months = 12): Promise<MonthlyDownloadPoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);
  const rows = await prisma.brochureDownloadEvent.findMany({
    where: { eventType: DOWNLOAD, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  for (const row of rows) {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

export interface BreakdownItem {
  label: string;
  count: number;
}

export async function getDownloadsByDevice(): Promise<BreakdownItem[]> {
  const grouped = await prisma.brochureDownloadEvent.groupBy({
    by: ["device"],
    where: { eventType: DOWNLOAD },
    _count: { _all: true },
    orderBy: { _count: { device: "desc" } },
  });
  return grouped.map((g) => ({ label: g.device ?? "Unknown", count: g._count._all }));
}

/** Groups by the referrer's registered domain ("Direct" when there is none) — a lightweight stand-in for full UTM-source reporting. */
export async function getDownloadsBySource(limit = 10): Promise<BreakdownItem[]> {
  const rows = await prisma.brochureDownloadEvent.findMany({
    where: { eventType: DOWNLOAD },
    select: { referrer: true, utmSource: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    let label = row.utmSource;
    if (!label && row.referrer) {
      try {
        label = new URL(row.referrer).hostname.replace(/^www\./, "");
      } catch {
        label = "Direct";
      }
    }
    label = label || "Direct";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface EntityBrochureStats {
  totalDownloads: number;
  lastDownloadAt: Date | null;
  downloadsLast7Days: number;
  downloadsLast30Days: number;
  downloadsThisMonth: number;
}

/** Per-project internal stats — surfaced on the admin project edit page. */
export async function getProjectBrochureStats(projectId: string): Promise<EntityBrochureStats> {
  const [totalDownloads, last, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth] = await Promise.all([
    prisma.brochureDownloadEvent.count({ where: { projectId, eventType: DOWNLOAD } }),
    prisma.brochureDownloadEvent.findFirst({ where: { projectId, eventType: DOWNLOAD }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.brochureDownloadEvent.count({ where: { projectId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(7) } } }),
    prisma.brochureDownloadEvent.count({ where: { projectId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(30) } } }),
    prisma.brochureDownloadEvent.count({ where: { projectId, eventType: DOWNLOAD, createdAt: { gte: startOfMonth(new Date()) } } }),
  ]);
  return { totalDownloads, lastDownloadAt: last?.createdAt ?? null, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth };
}

/** Aggregate across every project belonging to this builder. */
export async function getBuilderBrochureStats(builderId: string): Promise<EntityBrochureStats> {
  const [totalDownloads, last, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth] = await Promise.all([
    prisma.brochureDownloadEvent.count({ where: { builderId, eventType: DOWNLOAD } }),
    prisma.brochureDownloadEvent.findFirst({ where: { builderId, eventType: DOWNLOAD }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.brochureDownloadEvent.count({ where: { builderId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(7) } } }),
    prisma.brochureDownloadEvent.count({ where: { builderId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(30) } } }),
    prisma.brochureDownloadEvent.count({ where: { builderId, eventType: DOWNLOAD, createdAt: { gte: startOfMonth(new Date()) } } }),
  ]);
  return { totalDownloads, lastDownloadAt: last?.createdAt ?? null, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth };
}

/** Aggregate across every project in this locality. */
export async function getLocalityBrochureStats(localityId: string): Promise<EntityBrochureStats> {
  const [totalDownloads, last, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth] = await Promise.all([
    prisma.brochureDownloadEvent.count({ where: { localityId, eventType: DOWNLOAD } }),
    prisma.brochureDownloadEvent.findFirst({ where: { localityId, eventType: DOWNLOAD }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.brochureDownloadEvent.count({ where: { localityId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(7) } } }),
    prisma.brochureDownloadEvent.count({ where: { localityId, eventType: DOWNLOAD, createdAt: { gte: daysAgo(30) } } }),
    prisma.brochureDownloadEvent.count({ where: { localityId, eventType: DOWNLOAD, createdAt: { gte: startOfMonth(new Date()) } } }),
  ]);
  return { totalDownloads, lastDownloadAt: last?.createdAt ?? null, downloadsLast7Days, downloadsLast30Days, downloadsThisMonth };
}

export interface BrochureEventRow {
  id: string;
  createdAt: Date;
  eventType: string;
  projectName: string;
  builderName: string | null;
  localityName: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  isRepeat: boolean;
  isLoggedIn: boolean;
}

/** Raw event rows for CSV export — capped so an unbounded event table can never produce an unbounded export. */
export async function getBrochureEventsForExport(limit = 5000): Promise<BrochureEventRow[]> {
  const events = await prisma.brochureDownloadEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      project: { select: { name: true } },
    },
  });
  const builderIds = [...new Set(events.map((e) => e.builderId).filter((id): id is string => id !== null))];
  const localityIds = [...new Set(events.map((e) => e.localityId).filter((id): id is string => id !== null))];
  const [builders, localities] = await Promise.all([
    builderIds.length ? prisma.builder.findMany({ where: { id: { in: builderIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    localityIds.length ? prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const builderById = new Map(builders.map((b) => [b.id, b.name]));
  const localityById = new Map(localities.map((l) => [l.id, l.name]));

  return events.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    eventType: e.eventType,
    projectName: e.project.name,
    builderName: e.builderId ? (builderById.get(e.builderId) ?? null) : null,
    localityName: e.localityId ? (localityById.get(e.localityId) ?? null) : null,
    device: e.device,
    browser: e.browser,
    os: e.os,
    country: e.country,
    city: e.city,
    isRepeat: e.isRepeat,
    isLoggedIn: e.publicUserId !== null,
  }));
}
