import type { Prisma, ProjectStatus, TransactionType, DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { distanceMeters } from "@/lib/geo";
import { AnalyticsService } from "@/lib/analytics";

/**
 * Every admin read goes through this. A transient DB/network failure must
 * degrade the panel (empty list / zero counts) instead of crashing the page —
 * the error is still logged server-side for diagnosis.
 */
async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[admin-queries] ${label} failed:`, error);
    return fallback;
  }
}

const EMPTY_STATS = {
  projectCount: 0,
  publishedCount: 0,
  draftCount: 0,
  reviewCount: 0,
  archivedCount: 0,
  builderCount: 0,
  localityCount: 0,
  transactionCount: 0,
  imageCount: 0,
  avgPricePaise: null as bigint | null,
};

export async function getDashboardStats() {
  return safeQuery("getDashboardStats", EMPTY_STATS, async () => {
    const [projectCount, publishedCount, reviewCount, archivedCount, builderCount, localityCount, transactionCount, imageCount, priceAgg] =
      await Promise.all([
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.project.count({ where: { isPublished: true, deletedAt: null } }),
        prisma.project.count({ where: { isPublished: false, submittedForReviewAt: { not: null }, deletedAt: null } }),
        prisma.project.count({ where: { isArchived: true, deletedAt: null } }),
        prisma.builder.count({ where: { deletedAt: null } }),
        prisma.locality.count({ where: { deletedAt: null } }),
        prisma.transaction.count({ where: { deletedAt: null } }),
        prisma.projectImage.count({ where: { project: { deletedAt: null } } }),
        prisma.project.aggregate({
          _avg: { priceMinPaise: true, priceMaxPaise: true },
          where: { OR: [{ priceMinPaise: { not: null } }, { priceMaxPaise: { not: null } }], deletedAt: null },
        }),
      ]);

    const avgMin = priceAgg._avg.priceMinPaise;
    const avgMax = priceAgg._avg.priceMaxPaise;
    let avgPricePaise: bigint | null = null;
    if (avgMin !== null && avgMax !== null) avgPricePaise = (BigInt(Math.round(avgMin)) + BigInt(Math.round(avgMax))) / BigInt(2);
    else if (avgMin !== null) avgPricePaise = BigInt(Math.round(avgMin));
    else if (avgMax !== null) avgPricePaise = BigInt(Math.round(avgMax));

    return {
      projectCount,
      publishedCount,
      draftCount: projectCount - publishedCount,
      reviewCount,
      archivedCount,
      builderCount,
      localityCount,
      transactionCount,
      imageCount,
      avgPricePaise,
    };
  });
}

export async function getLatestUpload() {
  return safeQuery("getLatestUpload", null, () =>
    prisma.projectImage.findFirst({
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true, slug: true } } },
    })
  );
}

export interface ChartBucket {
  label: string;
  count: number;
}

const PRICE_BUCKETS_CR = [
  { label: "< 1 Cr", max: 1_00_00_000 },
  { label: "1-2 Cr", max: 2_00_00_000 },
  { label: "2-5 Cr", max: 5_00_00_000 },
  { label: "5-10 Cr", max: 10_00_00_000 },
  { label: "10 Cr+", max: Infinity },
];

export async function getDashboardCharts() {
  return safeQuery(
    "getDashboardCharts",
    { byLocality: [] as ChartBucket[], byBuilder: [] as ChartBucket[], byStatus: [] as ChartBucket[], priceDistribution: [] as ChartBucket[] },
    async () => {
      const [byLocalityRaw, byBuilderRaw, byStatusRaw, projects] = await Promise.all([
        prisma.project.groupBy({
          by: ["localityId"],
          _count: { _all: true },
          where: { deletedAt: null },
          orderBy: { _count: { localityId: "desc" } },
          take: 8,
        }),
        prisma.project.groupBy({
          by: ["builderId"],
          _count: { _all: true },
          where: { builderId: { not: null }, deletedAt: null },
          orderBy: { _count: { builderId: "desc" } },
          take: 8,
        }),
        prisma.project.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: { deletedAt: null },
        }),
        prisma.project.findMany({
          where: { OR: [{ priceMinPaise: { not: null } }, { priceMaxPaise: { not: null } }], deletedAt: null },
          select: { priceMinPaise: true, priceMaxPaise: true },
        }),
      ]);

      const localityIds = byLocalityRaw.map((r) => r.localityId);
      const builderIds = byBuilderRaw.map((r) => r.builderId).filter((id): id is string => id !== null);
      const [localities, builders] = await Promise.all([
        prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } }),
        prisma.builder.findMany({ where: { id: { in: builderIds } }, select: { id: true, name: true } }),
      ]);
      const localityName = new Map(localities.map((l) => [l.id, l.name]));
      const builderName = new Map(builders.map((b) => [b.id, b.name]));

      const byLocality: ChartBucket[] = byLocalityRaw.map((r) => ({
        label: localityName.get(r.localityId) ?? "Unknown",
        count: r._count._all,
      }));
      const byBuilder: ChartBucket[] = byBuilderRaw.map((r) => ({
        label: (r.builderId && builderName.get(r.builderId)) ?? "Unknown",
        count: r._count._all,
      }));
      const byStatus: ChartBucket[] = byStatusRaw.map((r) => ({ label: r.status, count: r._count._all }));

      const priceDistribution: ChartBucket[] = PRICE_BUCKETS_CR.map((bucket) => ({ label: bucket.label, count: 0 }));
      for (const project of projects) {
        const min = project.priceMinPaise !== null ? Number(project.priceMinPaise) : null;
        const max = project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null;
        const mid = min !== null && max !== null ? (min + max) / 2 : (min ?? max ?? 0);
        const bucketIndex = PRICE_BUCKETS_CR.findIndex((b) => mid < b.max);
        const idx = bucketIndex === -1 ? PRICE_BUCKETS_CR.length - 1 : bucketIndex;
        priceDistribution[idx].count += 1;
      }

      return { byLocality, byBuilder, byStatus, priceDistribution };
    }
  );
}

export interface UserGrowthStats {
  totalUsers: number;
  newLast7d: number;
  newLast30d: number;
  /** Distinct signed-in users with a ResearchEvent (project view, search, compare, etc.) in the window -- not raw pageviews, not anonymous traffic (see GA for that). */
  dau: number;
  wau: number;
  mau: number;
  emailVerifiedCount: number;
  emailVerifiedPercent: number;
  /** Distinct active users per calendar day, last 14 days -- the one growth signal not already covered by /admin/analytics/registration-funnel's event-volume and signup-trend charts. */
  activeTrend: ChartBucket[];
}

const EMPTY_USER_GROWTH: UserGrowthStats = {
  totalUsers: 0,
  newLast7d: 0,
  newLast30d: 0,
  dau: 0,
  wau: 0,
  mau: 0,
  emailVerifiedCount: 0,
  emailVerifiedPercent: 0,
  activeTrend: [],
};

/**
 * DAU/WAU/MAU here means "distinct registered PublicUsers with at least one
 * ResearchEvent in the window" -- the same event log every project view,
 * search, filter, compare and wishlist add already writes to (see
 * lib/analytics/research-events.ts). Deliberately NOT derived from
 * PublicUser.lastLoginAt, which only updates on a fresh sign-in and would
 * badly undercount a user who stays logged in for weeks. Anonymous traffic
 * (no account) isn't counted here -- that's what the GA4 integration is for.
 *
 * Signup trend, Google/Email split and "signups today/this week" already
 * live on /admin/analytics/registration-funnel -- deliberately not
 * recomputed here to avoid two divergent copies of the same chart.
 */
export async function getUserGrowthStats(): Promise<UserGrowthStats> {
  return safeQuery("getUserGrowthStats", EMPTY_USER_GROWTH, async () => {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Last 14 days, oldest -> newest, as UTC day boundaries.
    const dayKeys: { start: Date; end: Date; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      dayKeys.push({ start, end, label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }) });
    }

    const [totalUsers, newLast7d, newLast30d, emailVerifiedCount, dauGroups, wauGroups, mauGroups, dailyGroups] = await Promise.all([
      prisma.publicUser.count(),
      prisma.publicUser.count({ where: { createdAt: { gte: since7d } } }),
      prisma.publicUser.count({ where: { createdAt: { gte: since30d } } }),
      prisma.publicUser.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: since24h } } }),
      prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: since7d } } }),
      prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: since30d } } }),
      // One groupBy per day rather than one findMany over the full 14-day window: each call
      // returns only that day's distinct publicUserId rows (its DAU), not every raw event row --
      // stays cheap as event volume grows, where fetching 14 days of raw events into memory to
      // dedupe in JS would not. Still 14 round trips, but they run in parallel via Promise.all.
      Promise.all(
        dayKeys.map((d) =>
          prisma.researchEvent.groupBy({
            by: ["publicUserId"],
            where: { publicUserId: { not: null }, createdAt: { gte: d.start, lt: d.end } },
          })
        )
      ),
    ]);

    const emailVerifiedPercent = totalUsers > 0 ? Math.round((emailVerifiedCount / totalUsers) * 100) : 0;

    const activeTrend: ChartBucket[] = dayKeys.map((d, i) => ({ label: d.label, count: dailyGroups[i].length }));

    return {
      totalUsers,
      newLast7d,
      newLast30d,
      dau: dauGroups.length,
      wau: wauGroups.length,
      mau: mauGroups.length,
      emailVerifiedCount,
      emailVerifiedPercent,
      activeTrend,
    };
  });
}

export interface RegisteredUserRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  lastActiveAt: Date | null;
  activity: "Daily" | "Weekly" | "Monthly" | "Inactive";
}

const EMPTY_REGISTERED_USERS_PAGE = { items: [] as RegisteredUserRow[], total: 0, page: 1, pageSize: 20, totalPages: 1 };

function activityFromLastActive(lastActiveAt: Date | null): RegisteredUserRow["activity"] {
  if (!lastActiveAt) return "Inactive";
  const days = (Date.now() - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 1) return "Daily";
  if (days <= 7) return "Weekly";
  if (days <= 30) return "Monthly";
  return "Inactive";
}

/**
 * Drill-down behind the dashboard's "Registered Users" tile (getUserGrowthStats
 * gives the aggregate count only). `lastActiveAt` is scoped to just this page's
 * user IDs via `publicUserId: { in }`, not a full ResearchEvent scan, so this
 * stays cheap as both the user base and the event log grow.
 */
export async function getRegisteredUsersPage(page = 1, pageSize = 20) {
  return safeQuery("getRegisteredUsersPage", EMPTY_REGISTERED_USERS_PAGE, async () => {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const [users, total] = await Promise.all([
      prisma.publicUser.findMany({
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: { id: true, name: true, email: true, phone: true, createdAt: true, emailVerifiedAt: true },
      }),
      prisma.publicUser.count(),
    ]);

    const lastActiveGroups = await prisma.researchEvent.groupBy({
      by: ["publicUserId"],
      where: { publicUserId: { in: users.map((u) => u.id) } },
      _max: { createdAt: true },
    });
    const lastActiveById = new Map(lastActiveGroups.map((g) => [g.publicUserId as string, g._max.createdAt]));

    const items: RegisteredUserRow[] = users.map((u) => {
      const lastActiveAt = lastActiveById.get(u.id) ?? null;
      return { ...u, lastActiveAt, activity: activityFromLastActive(lastActiveAt) };
    });

    return { items, total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
  });
}

export async function getActivityFeed(limit = 15) {
  return safeQuery("getActivityFeed", [], () =>
    prisma.auditLog.findMany({
      orderBy: { at: "desc" },
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    })
  );
}

export interface ActivityFeedFilters {
  since?: Date;
  until?: Date;
  entityType?: string;
  actorId?: string;
}

/**
 * The full Activity Center page (Section 22) — same underlying AuditLog
 * table as the dashboard's getActivityFeed widget above, extended with the
 * period/entity/actor filtering a standalone page needs. Callers pass the
 * period's since/until from the existing central date-period utility
 * (lib/analytics/period.ts) rather than this function doing its own date math.
 */
export async function getActivityFeedFiltered(filters: ActivityFeedFilters, limit = 100) {
  return safeQuery("getActivityFeedFiltered", [], () =>
    prisma.auditLog.findMany({
      where: {
        ...(filters.since || filters.until
          ? { at: { ...(filters.since ? { gte: filters.since } : {}), ...(filters.until ? { lt: filters.until } : {}) } }
          : {}),
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
      },
      orderBy: { at: "desc" },
      take: limit,
      include: { actor: { select: { id: true, name: true, email: true } } },
    })
  );
}

/** Distinct entity types currently present in AuditLog — powers the Activity Center's filter dropdown without hardcoding a list that drifts from what's actually logged. */
export async function getActivityEntityTypes(): Promise<string[]> {
  return safeQuery("getActivityEntityTypes", [], async () => {
    const rows = await prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } });
    return rows.map((r) => r.entityType);
  });
}

export async function getRecentProjectsAdmin(limit = 5) {
  return safeQuery("getRecentProjectsAdmin", [], () =>
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { locality: true, builder: true },
    })
  );
}

export async function getRecentTransactionsAdmin(limit = 5) {
  return safeQuery("getRecentTransactionsAdmin", [], () =>
    prisma.transaction.findMany({
      where: { deletedAt: null },
      orderBy: { registrationDate: "desc" },
      take: limit,
      include: { locality: true, project: true },
    })
  );
}

export interface ProjectListFilters {
  q?: string;
  status?: string;
  category?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  showArchived?: boolean;
  /** Drafts currently awaiting admin review — takes precedence over isPublished when set. */
  reviewOnly?: boolean;
  bedrooms?: string; // "1" | "2" | "3" | "4" (4 = 4+)
  priceMinRupees?: number;
  priceMaxRupees?: number;
  possession?: string; // "ready" | "1yr" | "2yr" | "later"
  hasRera?: boolean;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

const EMPTY_PROJECT_PAGE = { items: [] as Awaited<ReturnType<typeof fetchProjectsPage>>["items"], total: 0, page: 1, pageSize: 20, totalPages: 1 };

function possessionDateRange(possession: string | undefined): { lte?: Date; gte?: Date } | null {
  if (!possession) return null;
  const now = new Date();
  if (possession === "ready") return { lte: now };
  const years = possession === "1yr" ? 1 : possession === "2yr" ? 2 : null;
  if (years === null) {
    const twoYearsOut = new Date(now);
    twoYearsOut.setFullYear(twoYearsOut.getFullYear() + 2);
    return { gte: twoYearsOut };
  }
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() + years);
  return { gte: now, lte: cutoff };
}

function buildProjectOrderBy(sortBy: string | undefined): Prisma.ProjectOrderByWithRelationInput {
  switch (sortBy) {
    case "price_asc":
      return { priceMinPaise: "asc" };
    case "price_desc":
      return { priceMaxPaise: "desc" };
    case "name_asc":
      return { name: "asc" };
    case "launch_desc":
      return { launchDate: "desc" };
    case "possession_asc":
      return { promisedPossession: "asc" };
    default:
      return { updatedAt: "desc" };
  }
}

async function fetchProjectsPage(filters: ProjectListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.ProjectWhereInput = { isArchived: filters.showArchived ? true : false, deletedAt: null };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { tagline: { contains: filters.q, mode: "insensitive" } },
      { reraNumber: { contains: filters.q, mode: "insensitive" } },
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { builder: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status as ProjectStatus;
  if (filters.category) where.category = filters.category as Prisma.ProjectWhereInput["category"];
  if (filters.reviewOnly) {
    where.isPublished = false;
    where.submittedForReviewAt = { not: null };
  } else if (filters.isPublished !== undefined) {
    where.isPublished = filters.isPublished;
  }
  if (filters.isFeatured !== undefined) where.isFeatured = filters.isFeatured;
  if (filters.bedrooms) {
    const n = Number(filters.bedrooms);
    where.configurations = { some: n >= 4 ? { bedrooms: { gte: 4 } } : { bedrooms: { gte: n, lt: n + 1 } } };
  }
  if (filters.priceMinRupees !== undefined) {
    where.priceMaxPaise = { gte: BigInt(Math.round(filters.priceMinRupees * 100)) };
  }
  if (filters.priceMaxRupees !== undefined) {
    where.priceMinPaise = { ...(where.priceMinPaise as object), lte: BigInt(Math.round(filters.priceMaxRupees * 100)) };
  }
  const possessionRange = possessionDateRange(filters.possession);
  if (possessionRange) where.promisedPossession = possessionRange;
  if (filters.hasRera !== undefined) {
    where.reraNumber = filters.hasRera ? { not: null } : null;
  }

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: buildProjectOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        status: true,
        priceMinPaise: true,
        priceMaxPaise: true,
        updatedAt: true,
        isPublished: true,
        isFeatured: true,
        isArchived: true,
        reraNumber: true,
        constructionPercent: true,
        completionPercent: true,
        submittedForReviewAt: true,
        locality: { select: { name: true } },
        builder: { select: { name: true } },
        images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
    prisma.project.count({ where }),
  ]);

  // priceMinPaise/priceMaxPaise are BigInt columns -- raw BigInt can't cross
  // the Server->Client boundary into ProjectsTable ("use client"). Same fix
  // as getProjectForEdit, same reason it was missed until now: no project's
  // list row had ever carried non-null pricing before.
  const convertedItems = items.map((p) => ({
    ...p,
    priceMinPaise: p.priceMinPaise !== null ? Number(p.priceMinPaise) : null,
    priceMaxPaise: p.priceMaxPaise !== null ? Number(p.priceMaxPaise) : null,
  }));

  return { items: convertedItems, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getProjectsAdminPaged(filters: ProjectListFilters) {
  return safeQuery("getProjectsAdminPaged", EMPTY_PROJECT_PAGE, () => fetchProjectsPage(filters));
}

export async function getProjectForEdit(id: string) {
  return safeQuery("getProjectForEdit", null, async () => {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        configurations: { orderBy: { sortOrder: "asc" } },
        paymentMilestones: { orderBy: { sortOrder: "asc" } },
        amenities: { include: { amenity: true } },
        specifications: { orderBy: { sortOrder: "asc" } },
        documents: { orderBy: { sortOrder: "asc" } },
        timelineEvents: { orderBy: { sortOrder: "asc" } },
        faqs: { orderBy: { sortOrder: "asc" } },
        sections: { orderBy: { sortOrder: "asc" } },
        investmentNotes: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        infraLinks: { include: { infra: true }, orderBy: { distanceMeters: "asc" } },
        // select (not include) — Locality also carries Decimal market-snapshot
        // fields (rentalYieldPercent, growthPercentYoy) that can't cross the
        // Server->Client boundary; only `name` is actually rendered here.
        locality: { select: { id: true, name: true } },
        builder: true,
      },
    });
    if (!project) return null;
    return {
      ...project,
      landAreaAcres: project.landAreaAcres !== null ? Number(project.landAreaAcres) : null,
      // priceMinPaise/priceMaxPaise are BigInt columns -- raw BigInt values
      // can't cross the Server->Client Component boundary (ProjectForm and
      // ConfigurationsManager are both "use client"), the same reason every
      // other BigInt/Decimal field on this object is converted to Number
      // right here rather than passed through raw. This was previously
      // missed because no project had ever had a non-null priceMinPaise on
      // an individual configuration row until now -- every prior test
      // project left it null, so the crash was never exercised.
      priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
      priceMaxPaise: project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null,
      configurations: project.configurations.map((c) => ({
        ...c,
        bedrooms: Number(c.bedrooms),
        carpetSqft: c.carpetSqft !== null ? Number(c.carpetSqft) : null,
        builtUpSqft: c.builtUpSqft !== null ? Number(c.builtUpSqft) : null,
        priceMinPaise: c.priceMinPaise !== null ? Number(c.priceMinPaise) : null,
        priceMaxPaise: c.priceMaxPaise !== null ? Number(c.priceMaxPaise) : null,
      })),
      paymentMilestones: project.paymentMilestones.map((m) => ({
        ...m,
        percentage: m.percentage !== null ? Number(m.percentage) : null,
        amountPaise: m.amountPaise !== null ? Number(m.amountPaise) : null,
      })),
      amenityIds: project.amenities.map((a) => a.amenityId),
    };
  });
}

export async function getMicroMarketsForLocality(localityId: string) {
  return safeQuery("getMicroMarketsForLocality", [], () =>
    prisma.microMarket.findMany({ where: { localityId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  );
}

export async function getInfraAssetsForCity() {
  return safeQuery("getInfraAssetsForCity", [], async () => {
    const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
    if (!city) return [];
    return prisma.infraAsset.findMany({
      where: { cityId: city.id },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    });
  });
}

export interface BuilderListFilters {
  q?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  showArchived?: boolean;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

const EMPTY_BUILDER_PAGE = {
  items: [] as Awaited<ReturnType<typeof fetchBuildersPage>>["items"],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

function buildBuilderOrderBy(sortBy: string | undefined): Prisma.BuilderOrderByWithRelationInput {
  switch (sortBy) {
    case "name_asc":
      return { name: "asc" };
    case "founded_asc":
      return { foundedYear: "asc" };
    case "founded_desc":
      return { foundedYear: "desc" };
    case "projects_desc":
      return { projects: { _count: "desc" } };
    default:
      return { updatedAt: "desc" };
  }
}

async function fetchBuildersPage(filters: BuilderListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.BuilderWhereInput = { isArchived: filters.showArchived ? true : false, deletedAt: null };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { headquarters: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;
  if (filters.isFeatured !== undefined) where.isFeatured = filters.isFeatured;

  const [items, total] = await Promise.all([
    prisma.builder.findMany({
      where,
      orderBy: buildBuilderOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { projects: true } } },
    }),
    prisma.builder.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getBuildersAdminPaged(filters: BuilderListFilters) {
  return safeQuery("getBuildersAdminPaged", EMPTY_BUILDER_PAGE, () => fetchBuildersPage(filters));
}

export async function getBuilderForEdit(id: string) {
  return safeQuery("getBuilderForEdit", null, async () => {
    const builder = await prisma.builder.findUnique({
      where: { id },
      include: {
        timeline: { orderBy: [{ year: "asc" }, { sortOrder: "asc" }] },
        scoreSnapshots: { orderBy: { asOf: "desc" }, take: 10 },
        amenities: { include: { amenity: true } },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!builder) return null;
    return { ...builder, amenityIds: builder.amenities.map((a) => a.amenityId) };
  });
}

export interface LocalityListFilters {
  q?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  showArchived?: boolean;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

const EMPTY_LOCALITY_PAGE = {
  items: [] as Awaited<ReturnType<typeof fetchLocalitiesPage>>["items"],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

function buildLocalityOrderBy(sortBy: string | undefined): Prisma.LocalityOrderByWithRelationInput {
  switch (sortBy) {
    case "name_asc":
      return { name: "asc" };
    case "projects_desc":
      return { projects: { _count: "desc" } };
    case "price_desc":
      return { avgPricePerSqftPaise: "desc" };
    default:
      return { updatedAt: "desc" };
  }
}

async function fetchLocalitiesPage(filters: LocalityListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.LocalityWhereInput = {
    city: { slug: PRIMARY_CITY_SLUG },
    isArchived: filters.showArchived ? true : false,
    deletedAt: null,
  };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { pincode: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;
  if (filters.isFeatured !== undefined) where.isFeatured = filters.isFeatured;

  const [items, total] = await Promise.all([
    prisma.locality.findMany({
      where,
      orderBy: buildLocalityOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        zone: true,
        _count: { select: { projects: true, transactions: true } },
      },
    }),
    prisma.locality.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getLocalitiesAdminPaged(filters: LocalityListFilters) {
  return safeQuery("getLocalitiesAdminPaged", EMPTY_LOCALITY_PAGE, () => fetchLocalitiesPage(filters));
}

export async function getLocalityForEdit(id: string) {
  return safeQuery("getLocalityForEdit", null, async () => {
    const locality = await prisma.locality.findUnique({
      where: { id },
      include: {
        amenities: { include: { amenity: true } },
        images: { orderBy: { sortOrder: "asc" } },
        microMarkets: { orderBy: { name: "asc" } },
        _count: { select: { projects: true } },
      },
    });
    if (!locality) return null;
    return {
      ...locality,
      rentalYieldPercent: locality.rentalYieldPercent !== null ? Number(locality.rentalYieldPercent) : null,
      growthPercentYoy: locality.growthPercentYoy !== null ? Number(locality.growthPercentYoy) : null,
      investmentScore: locality.investmentScore !== null ? Number(locality.investmentScore) : null,
      endUserScore: locality.endUserScore !== null ? Number(locality.endUserScore) : null,
      luxuryScore: locality.luxuryScore !== null ? Number(locality.luxuryScore) : null,
      familyScore: locality.familyScore !== null ? Number(locality.familyScore) : null,
      // avgPricePerSqftPaise is a BigInt column -- same Server->Client
      // boundary fix as getProjectForEdit/fetchProjectsPage.
      avgPricePerSqftPaise: locality.avgPricePerSqftPaise !== null ? Number(locality.avgPricePerSqftPaise) : null,
      amenityIds: locality.amenities.map((a) => a.amenityId),
    };
  });
}

export async function getLocalityMarketStats(localityId: string) {
  return safeQuery(
    "getLocalityMarketStats",
    { totalTransactions: 0, totalSalesVolumePaise: null as bigint | null, avgTicketSizePaise: null as bigint | null, medianPricePaise: null as bigint | null },
    async () => {
      // Count/sum/avg computed in SQL via aggregate() — no need to pull every
      // row into memory for these three. Median has no SQL aggregate in
      // Prisma without raw percentile_cont, so it alone still needs the full
      // sorted value list; at real-world per-locality transaction volumes
      // (hundreds, not millions) that row fetch stays fast.
      const [counts, values] = await Promise.all([
        prisma.transaction.aggregate({ where: { localityId }, _count: { _all: true }, _sum: { valuePaise: true } }),
        prisma.transaction.findMany({ where: { localityId }, select: { valuePaise: true }, orderBy: { valuePaise: "asc" } }),
      ]);
      const totalTransactions = counts._count._all;
      if (totalTransactions === 0) {
        return { totalTransactions: 0, totalSalesVolumePaise: null, avgTicketSizePaise: null, medianPricePaise: null };
      }
      const totalSalesVolumePaise = counts._sum.valuePaise ?? BigInt(0);
      const avgTicketSizePaise = totalSalesVolumePaise / BigInt(totalTransactions);
      const sorted = values.map((t) => t.valuePaise);
      const mid = Math.floor(sorted.length / 2);
      const medianPricePaise = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / BigInt(2) : sorted[mid];
      return { totalTransactions, totalSalesVolumePaise, avgTicketSizePaise, medianPricePaise };
    }
  );
}

export async function getLocalityBuilderDistribution(localityId: string, publishedOnly = false) {
  return safeQuery("getLocalityBuilderDistribution", [] as ChartBucket[], async () => {
    const grouped = await prisma.project.groupBy({
      by: ["builderId"],
      where: { localityId, builderId: { not: null }, ...(publishedOnly ? { isPublished: true, isArchived: false } : {}) },
      _count: { _all: true },
      orderBy: { _count: { builderId: "desc" } },
      take: 8,
    });
    const builderIds = grouped.map((g) => g.builderId).filter((id): id is string => id !== null);
    const builders = await prisma.builder.findMany({ where: { id: { in: builderIds } }, select: { id: true, name: true } });
    const nameById = new Map(builders.map((b) => [b.id, b.name]));
    return grouped.map((g) => ({ label: (g.builderId && nameById.get(g.builderId)) ?? "Unknown", count: g._count._all }));
  });
}

export async function getLocalityNearbyInfra(localityId: string, radiusMeters = 3000) {
  return safeQuery("getLocalityNearbyInfra", [], async () => {
    const locality = await prisma.locality.findUnique({ where: { id: localityId }, select: { cityId: true, centroidLat: true, centroidLng: true } });
    if (!locality || locality.centroidLat === null || locality.centroidLng === null) return [];

    const assets = await prisma.infraAsset.findMany({
      where: { cityId: locality.cityId, latitude: { not: null }, longitude: { not: null } },
    });

    return assets
      .map((asset) => ({
        ...asset,
        distanceMeters: Math.round(
          distanceMeters(locality.centroidLat as number, locality.centroidLng as number, asset.latitude as number, asset.longitude as number)
        ),
      }))
      .filter((asset) => asset.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 20);
  });
}

export interface TransactionListFilters {
  q?: string;
  type?: string;
  dataSource?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

const EMPTY_TRANSACTION_PAGE = {
  items: [] as Awaited<ReturnType<typeof fetchTransactionsPage>>["items"],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

function buildTransactionOrderBy(sortBy: string | undefined): Prisma.TransactionOrderByWithRelationInput {
  switch (sortBy) {
    case "value_desc":
      return { valuePaise: "desc" };
    case "value_asc":
      return { valuePaise: "asc" };
    case "ppsf_desc":
      return { pricePerSqftPaise: "desc" };
    case "date_asc":
      return { registrationDate: "asc" };
    default:
      return { registrationDate: "desc" };
  }
}

async function fetchTransactionsPage(filters: TransactionListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

  const where: Prisma.TransactionWhereInput = { deletedAt: null };
  if (filters.q) {
    where.OR = [
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { project: { name: { contains: filters.q, mode: "insensitive" } } },
      { tower: { contains: filters.q, mode: "insensitive" } },
      { unitLabel: { contains: filters.q, mode: "insensitive" } },
      { sourceRef: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.type) where.type = filters.type as TransactionType;
  if (filters.dataSource) where.dataSource = filters.dataSource as DataSource;

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: buildTransactionOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { locality: true, project: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getTransactionsAdminPaged(filters: TransactionListFilters) {
  return safeQuery("getTransactionsAdminPaged", EMPTY_TRANSACTION_PAGE, () => fetchTransactionsPage(filters));
}

export async function getTransactionForEdit(id: string) {
  return safeQuery("getTransactionForEdit", null, async () => {
    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) return null;
    return {
      ...transaction,
      carpetSqft: transaction.carpetSqft !== null ? Number(transaction.carpetSqft) : null,
      builtUpSqft: transaction.builtUpSqft !== null ? Number(transaction.builtUpSqft) : null,
      bedrooms: transaction.bedrooms !== null ? Number(transaction.bedrooms) : null,
      // valuePaise/pricePerSqftPaise are BigInt columns -- same Server->Client
      // boundary fix as getProjectForEdit/fetchProjectsPage/getLocalityForEdit.
      valuePaise: Number(transaction.valuePaise),
      pricePerSqftPaise: transaction.pricePerSqftPaise !== null ? Number(transaction.pricePerSqftPaise) : null,
    };
  });
}

export async function getZones() {
  return safeQuery("getZones", [], () =>
    prisma.zone.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG } },
      orderBy: { name: "asc" },
    })
  );
}

/**
 * The one shared locality dropdown/filter source reused by both admin
 * selectors (project/transaction edit forms, email recipient targeting) and
 * every public-facing locality filter (Transactions, Projects, account
 * preferences) -- confirmed via a full call-site grep, not duplicated
 * per-page. Excludes archived/soft-deleted rows (a "Test Locality" seed
 * record or any other retired locality) so those can never leak into a
 * public filter dropdown; deliberately does NOT filter by isPublished,
 * since both audiences legitimately need to see/select a real locality
 * whose own catalog page isn't published yet (e.g. a live project already
 * points at it).
 */
export async function getLocalitiesForSelect() {
  return safeQuery("getLocalitiesForSelect", [], () =>
    prisma.locality.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG }, isArchived: false, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        microMarkets: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    })
  );
}

export async function getBuildersForSelect() {
  return safeQuery("getBuildersForSelect", [], () =>
    prisma.builder.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  );
}

export async function getProjectsForSelect() {
  return safeQuery("getProjectsForSelect", [], () =>
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } })
  );
}

export async function getAllImagesAdmin() {
  return safeQuery("getAllImagesAdmin", [], () =>
    prisma.projectImage.findMany({
      orderBy: { createdAt: "desc" },
      include: { project: { select: { id: true, name: true, slug: true } } },
    })
  );
}

/** Shared catalogue (projectId: null) plus, when editing an existing project, that project's own
 * private custom amenities -- never another project's. Callers with no projectId (Builder/Locality
 * forms, and the New Project page before a project exists) only ever see the shared catalogue. */
export async function getAmenities(projectId?: string) {
  return safeQuery("getAmenities", [], () =>
    prisma.amenity.findMany({
      where: projectId ? { OR: [{ projectId: null }, { projectId }] } : { projectId: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    })
  );
}

export interface GlobalSearchResult {
  projects: { id: string; name: string; slug: string }[];
  builders: { id: string; name: string; slug: string }[];
  localities: { id: string; name: string; slug: string }[];
}

export async function globalSearch(query: string): Promise<GlobalSearchResult> {
  const empty: GlobalSearchResult = { projects: [], builders: [], localities: [] };
  if (!query.trim()) return empty;
  return safeQuery("globalSearch", empty, async () => {
    const [projects, builders, localities] = await Promise.all([
      prisma.project.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        take: 6,
      }),
      prisma.builder.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        take: 6,
      }),
      prisma.locality.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        take: 6,
      }),
    ]);
    return { projects, builders, localities };
  });
}

export async function getUsersAdmin() {
  return safeQuery("getUsersAdmin", [], () =>
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } })
  );
}

export interface MonthlyPricePoint {
  month: string;
  avgPricePerSqftPaise: number;
}

/**
 * Both trend functions below delegate month-bucketing and the avg-₹/sqft
 * calculation to AnalyticsService.Transaction.calculateMonthlyTrend --
 * previously each had its own inline bucket-and-average-of-pricePerSqftPaise
 * loop (duplicated, and using the same "average of already-derived rates"
 * methodology now fixed in transactionAnalytics.ts to a size-weighted
 * Σvalue/Σarea instead). One formula, one place; see the doc comment on
 * calculateAveragePricePerSqft for the full rationale.
 */
export async function getMonthlyPriceTrend(monthsBack = 12) {
  return safeQuery("getMonthlyPriceTrend", [] as MonthlyPricePoint[], async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const transactions = await prisma.transaction.findMany({
      where: { registrationDate: { gte: since } },
      select: { registrationDate: true, valuePaise: true, pricePerSqftPaise: true, carpetSqft: true },
      orderBy: { registrationDate: "asc" },
    });

    return AnalyticsService.Transaction.calculateMonthlyTrend(transactions)
      .filter((p) => p.avgPricePerSqftPaise !== null)
      .map((p) => ({ month: p.month.toISOString().slice(0, 10), avgPricePerSqftPaise: Math.round(p.avgPricePerSqftPaise as number) }));
  });
}

export async function getLocalityPriceTrend(localityId: string, monthsBack = 12) {
  return safeQuery("getLocalityPriceTrend", [] as MonthlyPricePoint[], async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const transactions = await prisma.transaction.findMany({
      where: { localityId, registrationDate: { gte: since } },
      select: { registrationDate: true, valuePaise: true, pricePerSqftPaise: true, carpetSqft: true },
      orderBy: { registrationDate: "asc" },
    });

    return AnalyticsService.Transaction.calculateMonthlyTrend(transactions)
      .filter((p) => p.avgPricePerSqftPaise !== null)
      .map((p) => ({ month: p.month.toISOString().slice(0, 10), avgPricePerSqftPaise: Math.round(p.avgPricePerSqftPaise as number) }));
  });
}

export async function getLocalityMarketSnapshot() {
  return safeQuery("getLocalityMarketSnapshot", [], () =>
    prisma.locality.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG }, OR: [{ avgPricePerSqftPaise: { not: null } }, { rentalYieldPercent: { not: null } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avgPricePerSqftPaise: true, rentalYieldPercent: true, growthPercentYoy: true },
    })
  );
}

export async function getBuilderTrustLeaderboard() {
  return safeQuery("getBuilderTrustLeaderboard", [], async () => {
    const builders = await prisma.builder.findMany({
      where: { scoreSnapshots: { some: {} } },
      select: {
        id: true,
        name: true,
        scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      },
    });
    return builders
      .filter((b) => b.scoreSnapshots.length > 0)
      .map((b) => ({ id: b.id, name: b.name, score: Number(b.scoreSnapshots[0].overallScore), asOf: b.scoreSnapshots[0].asOf }))
      .sort((a, b) => b.score - a.score);
  });
}

/** Citywide monthly transaction count trend — the "Transaction Velocity" chart on the Analytics page. */
/** `range` optionally scopes to an exact [since, until) window (Section 34/37's shared analytics period) instead of a trailing `monthsBack` count — bucketing itself stays monthly regardless of the selected period's own granularity, since transaction velocity is conventionally read month-over-month even when the founder is viewing, say, a single week. */
export async function getTransactionVelocityTrend(monthsBack = 12, range?: { since: Date; until: Date }) {
  return safeQuery("getTransactionVelocityTrend", [] as { month: string; count: number }[], async () => {
    const since = range?.since ?? (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - monthsBack);
      return d;
    })();
    const rows = await prisma.transaction.findMany({
      where: { registrationDate: { gte: since, ...(range ? { lt: range.until } : {}) } },
      select: { valuePaise: true, registrationDate: true, pricePerSqftPaise: true, carpetSqft: true },
    });
    return AnalyticsService.Transaction.calculateMonthlyTrend(rows).map((p) => ({
      month: p.month.toISOString(),
      count: p.count,
    }));
  });
}

/** Per-builder portfolio composition (delivered/under-construction/upcoming) — the "Builder Scorecards" panel. */
export async function getBuilderScorecards() {
  return safeQuery(
    "getBuilderScorecards",
    [] as { id: string; name: string; breakdown: ReturnType<typeof AnalyticsService.Developer.calculatePortfolioBreakdown> }[],
    async () => {
      const builders = await prisma.builder.findMany({
        where: { projects: { some: {} } },
        select: {
          id: true,
          name: true,
          projects: {
            select: { status: true, name: true, launchDate: true, createdAt: true, isFeatured: true, priceMinPaise: true, cityId: true },
          },
        },
      });
      return builders
        .map((b) => ({ id: b.id, name: b.name, breakdown: AnalyticsService.Developer.calculatePortfolioBreakdown(b.projects) }))
        .sort((a, b) => b.breakdown.activeCount + b.breakdown.deliveredCount - (a.breakdown.activeCount + a.breakdown.deliveredCount))
        .slice(0, 10);
    }
  );
}

/** Per-locality demand (recent vs. prior 90-day transaction volume) and supply (active project share) ranking. */
export async function getLocalityDemandRanking() {
  return safeQuery(
    "getLocalityDemandRanking",
    [] as {
      id: string;
      name: string;
      demandScore: number | null;
      demandLabel: string;
      supplyScore: number | null;
      supplyLabel: string;
      publishedProjectCount: number;
    }[],
    async () => {
      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(now.getDate() - 90);
      const oneEightyDaysAgo = new Date(now);
      oneEightyDaysAgo.setDate(now.getDate() - 180);

      const [localities, recentTx, priorTx] = await Promise.all([
        prisma.locality.findMany({
          where: { city: { slug: PRIMARY_CITY_SLUG } },
          select: { id: true, name: true, projects: { where: { isPublished: true }, select: { status: true } } },
        }),
        prisma.transaction.groupBy({ by: ["localityId"], where: { registrationDate: { gte: ninetyDaysAgo } }, _count: { _all: true } }),
        prisma.transaction.groupBy({
          by: ["localityId"],
          where: { registrationDate: { gte: oneEightyDaysAgo, lt: ninetyDaysAgo } },
          _count: { _all: true },
        }),
      ]);

      const recentMap = new Map(recentTx.map((r) => [r.localityId, r._count._all]));
      const priorMap = new Map(priorTx.map((r) => [r.localityId, r._count._all]));

      return localities
        .map((loc) => {
          const demand = AnalyticsService.Locality.calculateDemandIndicator(recentMap.get(loc.id) ?? 0, priorMap.get(loc.id) ?? 0);
          const supply = AnalyticsService.Locality.calculateSupplyIndicator(loc.projects.map((p) => p.status));
          return {
            id: loc.id,
            name: loc.name,
            demandScore: demand.score,
            demandLabel: demand.label,
            supplyScore: supply.score,
            supplyLabel: supply.label,
            publishedProjectCount: loc.projects.length,
          };
        })
        .filter((l) => l.demandScore !== null || l.publishedProjectCount > 0)
        .sort((a, b) => (b.demandScore ?? -1) - (a.demandScore ?? -1))
        .slice(0, 12);
    }
  );
}

export async function getIngestSources() {
  return safeQuery("getIngestSources", [], () => prisma.ingestSource.findMany({ orderBy: { label: "asc" } }));
}

export async function getRecentIngestBatches(limit = 20) {
  return safeQuery("getRecentIngestBatches", [], () =>
    prisma.ingestBatch.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { _count: { select: { logEntries: true, stagingRecords: true } } },
    })
  );
}

/** Failed batches only, with the source's `kind` attached so the UI can only offer Retry for connector-based (API) sources — a file-based batch's original upload isn't retained, so retrying it isn't meaningful. */
export async function getFailedIngestBatches(limit = 20) {
  return safeQuery("getFailedIngestBatches", [], async () => {
    const batches = await prisma.ingestBatch.findMany({
      where: { status: "failed" },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { _count: { select: { logEntries: true, stagingRecords: true } } },
    });
    const sourceKeys = [...new Set(batches.map((b) => b.sourceKey))];
    const sources = sourceKeys.length
      ? await prisma.ingestSource.findMany({ where: { key: { in: sourceKeys } }, select: { key: true, kind: true } })
      : [];
    const kindByKey = new Map(sources.map((s) => [s.key, s.kind]));
    return batches.map((b) => ({ ...b, sourceKind: kindByKey.get(b.sourceKey) ?? null }));
  });
}

export async function getIngestBatch(id: string) {
  return safeQuery("getIngestBatch", null, () => prisma.ingestBatch.findUnique({ where: { id } }));
}

export async function getIngestLogForBatch(batchId: string) {
  return safeQuery("getIngestLogForBatch", [], () =>
    prisma.ingestLogEntry.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } })
  );
}

/**
 * Plain-language operational summary for the Data Sync landing page (Section
 * 7's "Data Quality Dashboard") — composed entirely from the existing
 * IngestBatch/IngestStagingRecord/IngestLogEntry tables, no new model.
 */
export async function getDataSyncSummary() {
  return safeQuery(
    "getDataSyncSummary",
    { pendingReview: 0, possibleDuplicates: 0, invalidRecent: 0, failedBatches: 0, lastSyncAt: null as Date | null },
    async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [pendingReview, possibleDuplicates, invalidRecent, failedBatches, lastBatch] = await Promise.all([
        prisma.ingestStagingRecord.count({ where: { status: "PENDING" } }),
        prisma.ingestStagingRecord.count({ where: { status: "PENDING", matchedExistingId: { not: null } } }),
        prisma.ingestLogEntry.count({ where: { action: "FAILED", createdAt: { gte: sevenDaysAgo } } }),
        prisma.ingestBatch.count({ where: { status: "failed" } }),
        prisma.ingestBatch.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      ]);
      return { pendingReview, possibleDuplicates, invalidRecent, failedBatches, lastSyncAt: lastBatch?.startedAt ?? null };
    }
  );
}

export async function getPendingStagingRecords() {
  return safeQuery("getPendingStagingRecords", [], () =>
    prisma.ingestStagingRecord.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { batch: { select: { sourceKey: true } } },
    })
  );
}

export async function getInfraAssetById(id: string) {
  return safeQuery("getInfraAssetById", null, () => prisma.infraAsset.findUnique({ where: { id } }));
}

async function resolveDeletedByNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => id !== null)));
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

export interface TrashListFilters {
  q?: string;
}

export async function getTrashedProjects(filters: TrashListFilters = {}) {
  return safeQuery("getTrashedProjects", [] as Awaited<ReturnType<typeof fetchTrashedProjects>>, () => fetchTrashedProjects(filters));
}

async function fetchTrashedProjects(filters: TrashListFilters) {
  const where: Prisma.ProjectWhereInput = { deletedAt: { not: null } };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { reraNumber: { contains: filters.q, mode: "insensitive" } },
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { builder: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  const items = await prisma.project.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      name: true,
      reraNumber: true,
      deletedAt: true,
      deletedByUserId: true,
      locality: { select: { name: true } },
      builder: { select: { name: true } },
    },
  });
  const deletedByName = await resolveDeletedByNames(items.map((i) => i.deletedByUserId));
  return items.map((i) => ({ ...i, deletedByName: i.deletedByUserId ? deletedByName.get(i.deletedByUserId) ?? null : null }));
}

export async function getTrashedBuilders(filters: TrashListFilters = {}) {
  return safeQuery("getTrashedBuilders", [] as Awaited<ReturnType<typeof fetchTrashedBuilders>>, () => fetchTrashedBuilders(filters));
}

async function fetchTrashedBuilders(filters: TrashListFilters) {
  const where: Prisma.BuilderWhereInput = { deletedAt: { not: null } };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { headquarters: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const items = await prisma.builder.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    select: { id: true, name: true, headquarters: true, deletedAt: true, deletedByUserId: true, _count: { select: { projects: true } } },
  });
  const deletedByName = await resolveDeletedByNames(items.map((i) => i.deletedByUserId));
  return items.map((i) => ({ ...i, deletedByName: i.deletedByUserId ? deletedByName.get(i.deletedByUserId) ?? null : null }));
}

export async function getTrashedLocalities(filters: TrashListFilters = {}) {
  return safeQuery("getTrashedLocalities", [] as Awaited<ReturnType<typeof fetchTrashedLocalities>>, () => fetchTrashedLocalities(filters));
}

async function fetchTrashedLocalities(filters: TrashListFilters) {
  const where: Prisma.LocalityWhereInput = { deletedAt: { not: null } };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { pincode: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const items = await prisma.locality.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      deletedByUserId: true,
      _count: { select: { projects: true, transactions: true } },
    },
  });
  const deletedByName = await resolveDeletedByNames(items.map((i) => i.deletedByUserId));
  return items.map((i) => ({ ...i, deletedByName: i.deletedByUserId ? deletedByName.get(i.deletedByUserId) ?? null : null }));
}

export async function getTrashedTransactions(filters: TrashListFilters = {}) {
  return safeQuery("getTrashedTransactions", [] as Awaited<ReturnType<typeof fetchTrashedTransactions>>, () => fetchTrashedTransactions(filters));
}

async function fetchTrashedTransactions(filters: TrashListFilters) {
  const where: Prisma.TransactionWhereInput = { deletedAt: { not: null } };
  if (filters.q) {
    where.OR = [
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { project: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  const items = await prisma.transaction.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      valuePaise: true,
      registrationDate: true,
      deletedAt: true,
      deletedByUserId: true,
      locality: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  const deletedByName = await resolveDeletedByNames(items.map((i) => i.deletedByUserId));
  return items.map((i) => ({
    ...i,
    valuePaise: Number(i.valuePaise),
    deletedByName: i.deletedByUserId ? deletedByName.get(i.deletedByUserId) ?? null : null,
  }));
}

export async function getAuditHistory(entityType: string, entityId: string, limit = 50) {
  return safeQuery("getAuditHistory", [], () =>
    prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { at: "desc" },
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    })
  );
}

export interface ReportContext {
  id: string;
  entityType: string;
  entityId: string | null;
  entityName: string;
  category: string | null;
  issue: string;
  suggestedValue: string | null;
  status: string;
  reporterEmail: string | null;
  createdAt: Date;
}

/** Powers the "Apply change" banner on an entity's edit page — the admin arrived here from a specific ACCEPTED report and needs its field-level context (issue/suggested value) without leaving the edit form. Returns null if the report doesn't actually point at this entity, so a stale/mismatched reportId in the URL can't show misleading context. */
export async function getReportContext(reportId: string, entityType: string, entityId: string): Promise<ReportContext | null> {
  return safeQuery("getReportContext", null, async () => {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, entityType: true, entityId: true, entityName: true, category: true, issue: true, suggestedValue: true, status: true, reporterEmail: true, createdAt: true },
    });
    if (!report || report.entityType !== entityType || report.entityId !== entityId) return null;
    return report;
  });
}

export interface RegisteredUsersPeriodStats {
  newUsersInPeriod: number;
  previousNewUsersInPeriod: number;
  activeUsersInPeriod: number;
}

/** Section 34's "Users"/"Active users" for the User Analytics page — additive alongside getUserGrowthStats' existing all-time totals and fixed DAU/WAU/MAU (Section 12-style "don't lose existing metrics" applies here too: those keep their fixed-window meaning, this is a new period-scoped pair). activeUsersInPeriod = distinct PublicUsers with >=1 ResearchEvent inside the period. */
export async function getRegisteredUsersPeriodStats(since: Date, until: Date, previousSince: Date, previousUntil: Date): Promise<RegisteredUsersPeriodStats> {
  return safeQuery("getRegisteredUsersPeriodStats", { newUsersInPeriod: 0, previousNewUsersInPeriod: 0, activeUsersInPeriod: 0 }, async () => {
    const [newUsersInPeriod, previousNewUsersInPeriod, activeGroups] = await Promise.all([
      prisma.publicUser.count({ where: { createdAt: { gte: since, lt: until } } }),
      prisma.publicUser.count({ where: { createdAt: { gte: previousSince, lt: previousUntil } } }),
      prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: since, lt: until } } }),
    ]);
    return { newUsersInPeriod, previousNewUsersInPeriod, activeUsersInPeriod: activeGroups.length };
  });
}

/** Recent notifications for one founder/admin User — real readAt-backed unread state (unlike the Activity panel's localStorage timestamp), so it's correct across devices/sessions. */
export async function getAdminNotifications(adminUserId: string, limit = 15) {
  return safeQuery("getAdminNotifications", [], () =>
    prisma.notification.findMany({
      where: { recipientAdminUserId: adminUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  );
}

export interface BrochureVersionItem {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByName: string | null;
  url: string;
  isCurrent: boolean;
}

/** Brochure version history for the admin edit page — same "view-only change-log" shape as getAuditHistory. */
export async function getBrochureVersions(projectId: string): Promise<BrochureVersionItem[]> {
  return safeQuery("getBrochureVersions", [], async () => {
    const [versions, project] = await Promise.all([
      prisma.projectBrochureVersion.findMany({ where: { projectId }, orderBy: { version: "desc" } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { brochureVersion: true } }),
    ]);
    if (versions.length === 0) return [];

    const uploaderIds = [...new Set(versions.map((v) => v.uploadedByUserId).filter((id): id is string => id !== null))];
    const uploaders = uploaderIds.length
      ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true, email: true } })
      : [];
    const uploaderById = new Map(uploaders.map((u) => [u.id, u.name ?? u.email]));

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      fileName: v.fileName,
      fileSize: v.fileSize,
      uploadedAt: v.uploadedAt,
      uploadedByName: v.uploadedByUserId ? (uploaderById.get(v.uploadedByUserId) ?? null) : null,
      url: v.url,
      isCurrent: v.version === project?.brochureVersion,
    }));
  });
}

export async function getUserForEdit(id: string) {
  return safeQuery("getUserForEdit", null, () =>
    prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, isActive: true, permissions: true } })
  );
}

/** Recent admin activity for one user (Section 7's "View employee activity") — reuses AuditLog, the same table every other admin activity view already reads. */
export async function getUserActivity(userId: string, limit = 50) {
  return safeQuery("getUserActivity", [], () =>
    prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { at: "desc" },
      take: limit,
      select: { id: true, action: true, entityType: true, entityId: true, at: true },
    })
  );
}

/**
 * Who's opted in to saved-search match alerts (Section 15) — SavedSearch.notifyOnMatch
 * is the one real opt-in flag; this just makes it visible. lastNotifiedAt is shown
 * as-is (null = never sent) rather than inventing a status, since no automated
 * matcher exists yet to actually send these (see lib/email.ts's sendSavedSearchAlertEmail
 * doc comment) -- this view is honest about that, not a claim the feature is live.
 */
export async function getSavedSearchNotificationEligibility(limit = 200) {
  return safeQuery("getSavedSearchNotificationEligibility", [], () =>
    prisma.savedSearch.findMany({
      where: { notifyOnMatch: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { publicUser: { select: { id: true, email: true, name: true } } },
    })
  );
}

/** Contact Us submissions for the admin queue (Section 9) — newest first, optionally filtered by status. */
export async function getContactEnquiries(
  status?: "NEW" | "IN_PROGRESS" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED",
  limit = 100
) {
  return safeQuery("getContactEnquiries", [], () =>
    prisma.contactEnquiry.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { publicUser: { select: { id: true, email: true, name: true } } },
    })
  );
}

export async function getTrashedContactEnquiries(filters: TrashListFilters = {}) {
  return safeQuery("getTrashedContactEnquiries", [] as Awaited<ReturnType<typeof fetchTrashedContactEnquiries>>, () =>
    fetchTrashedContactEnquiries(filters)
  );
}

async function fetchTrashedContactEnquiries(filters: TrashListFilters) {
  const where: Prisma.ContactEnquiryWhereInput = { deletedAt: { not: null } };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { message: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const items = await prisma.contactEnquiry.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    select: { id: true, name: true, email: true, subject: true, status: true, deletedAt: true, deletedByUserId: true },
  });
  const deletedByName = await resolveDeletedByNames(items.map((i) => i.deletedByUserId));
  return items.map((i) => ({ ...i, deletedByName: i.deletedByUserId ? deletedByName.get(i.deletedByUserId) ?? null : null }));
}

/** Powers the Contact Enquiry detail page (User / Enquiry / Status panels). */
export async function getContactEnquiryById(id: string) {
  return safeQuery("getContactEnquiryById", null, () =>
    prisma.contactEnquiry.findUnique({
      where: { id },
      include: { publicUser: { select: { id: true, email: true, name: true } } },
    })
  );
}

/** The employee-change approval queue (Section 7) — pending by default so the founder always lands on what needs a decision, with reviewed history available via `status`. */
export async function getPendingChanges(status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING", limit = 100) {
  return safeQuery("getPendingChanges", [], () =>
    prisma.pendingChange.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    })
  );
}
