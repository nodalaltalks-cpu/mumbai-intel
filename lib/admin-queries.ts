import type { Prisma, ProjectStatus } from "@prisma/client";
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
  archivedCount: 0,
  builderCount: 0,
  localityCount: 0,
  transactionCount: 0,
  imageCount: 0,
  avgPricePaise: null as bigint | null,
};

export async function getDashboardStats() {
  return safeQuery("getDashboardStats", EMPTY_STATS, async () => {
    const [projectCount, publishedCount, archivedCount, builderCount, localityCount, transactionCount, imageCount, priceAgg] =
      await Promise.all([
        prisma.project.count(),
        prisma.project.count({ where: { isPublished: true } }),
        prisma.project.count({ where: { isArchived: true } }),
        prisma.builder.count(),
        prisma.locality.count(),
        prisma.transaction.count(),
        prisma.projectImage.count(),
        prisma.project.aggregate({
          _avg: { priceMinPaise: true, priceMaxPaise: true },
          where: { OR: [{ priceMinPaise: { not: null } }, { priceMaxPaise: { not: null } }] },
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
          orderBy: { _count: { localityId: "desc" } },
          take: 8,
        }),
        prisma.project.groupBy({
          by: ["builderId"],
          _count: { _all: true },
          where: { builderId: { not: null } },
          orderBy: { _count: { builderId: "desc" } },
          take: 8,
        }),
        prisma.project.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.project.findMany({
          where: { OR: [{ priceMinPaise: { not: null } }, { priceMaxPaise: { not: null } }] },
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

export async function getActivityFeed(limit = 15) {
  return safeQuery("getActivityFeed", [], () =>
    prisma.auditLog.findMany({
      orderBy: { at: "desc" },
      take: limit,
      include: { actor: { select: { name: true, email: true } } },
    })
  );
}

export async function getRecentProjectsAdmin(limit = 5) {
  return safeQuery("getRecentProjectsAdmin", [], () =>
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { locality: true, builder: true },
    })
  );
}

export async function getRecentTransactionsAdmin(limit = 5) {
  return safeQuery("getRecentTransactionsAdmin", [], () =>
    prisma.transaction.findMany({
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

  const where: Prisma.ProjectWhereInput = { isArchived: filters.showArchived ? true : false };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { tagline: { contains: filters.q, mode: "insensitive" } },
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { builder: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status as ProjectStatus;
  if (filters.category) where.category = filters.category as Prisma.ProjectWhereInput["category"];
  if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;
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
        locality: { select: { name: true } },
        builder: { select: { name: true } },
        images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
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
      configurations: project.configurations.map((c) => ({
        ...c,
        bedrooms: Number(c.bedrooms),
        carpetSqft: c.carpetSqft !== null ? Number(c.carpetSqft) : null,
        builtUpSqft: c.builtUpSqft !== null ? Number(c.builtUpSqft) : null,
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

  const where: Prisma.BuilderWhereInput = { isArchived: filters.showArchived ? true : false };
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
      amenityIds: locality.amenities.map((a) => a.amenityId),
    };
  });
}

export async function getLocalityMarketStats(localityId: string) {
  return safeQuery(
    "getLocalityMarketStats",
    { totalTransactions: 0, totalSalesVolumePaise: null as bigint | null, avgTicketSizePaise: null as bigint | null, medianPricePaise: null as bigint | null },
    async () => {
      const transactions = await prisma.transaction.findMany({
        where: { localityId },
        select: { valuePaise: true },
      });
      const totalTransactions = transactions.length;
      if (totalTransactions === 0) {
        return { totalTransactions: 0, totalSalesVolumePaise: null, avgTicketSizePaise: null, medianPricePaise: null };
      }
      const values = transactions.map((t) => t.valuePaise).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const totalSalesVolumePaise = values.reduce((sum, v) => sum + v, BigInt(0));
      const avgTicketSizePaise = totalSalesVolumePaise / BigInt(totalTransactions);
      const mid = Math.floor(values.length / 2);
      const medianPricePaise = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / BigInt(2) : values[mid];
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

export async function getAllTransactionsAdmin(limit = 200) {
  return safeQuery("getAllTransactionsAdmin", [], () =>
    prisma.transaction.findMany({
      orderBy: { registrationDate: "desc" },
      take: limit,
      include: { locality: true, project: true },
    })
  );
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

export async function getLocalitiesForSelect() {
  return safeQuery("getLocalitiesForSelect", [], () =>
    prisma.locality.findMany({
      where: { city: { slug: PRIMARY_CITY_SLUG } },
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

export async function getAmenities() {
  return safeQuery("getAmenities", [], () => prisma.amenity.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }));
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

export async function getMonthlyPriceTrend(monthsBack = 12) {
  return safeQuery("getMonthlyPriceTrend", [] as MonthlyPricePoint[], async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const transactions = await prisma.transaction.findMany({
      where: { pricePerSqftPaise: { not: null }, registrationDate: { gte: since } },
      select: { registrationDate: true, pricePerSqftPaise: true },
      orderBy: { registrationDate: "asc" },
    });

    const buckets = new Map<string, { sum: number; count: number }>();
    for (const tx of transactions) {
      const key = `${tx.registrationDate.getFullYear()}-${String(tx.registrationDate.getMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += Number(tx.pricePerSqftPaise);
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { sum, count }]) => ({ month: `${month}-01`, avgPricePerSqftPaise: Math.round(sum / count) }));
  });
}

export async function getLocalityPriceTrend(localityId: string, monthsBack = 12) {
  return safeQuery("getLocalityPriceTrend", [] as MonthlyPricePoint[], async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const transactions = await prisma.transaction.findMany({
      where: { localityId, pricePerSqftPaise: { not: null }, registrationDate: { gte: since } },
      select: { registrationDate: true, pricePerSqftPaise: true },
      orderBy: { registrationDate: "asc" },
    });

    const buckets = new Map<string, { sum: number; count: number }>();
    for (const tx of transactions) {
      const key = `${tx.registrationDate.getFullYear()}-${String(tx.registrationDate.getMonth() + 1).padStart(2, "0")}`;
      const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += Number(tx.pricePerSqftPaise);
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { sum, count }]) => ({ month: `${month}-01`, avgPricePerSqftPaise: Math.round(sum / count) }));
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
export async function getTransactionVelocityTrend(monthsBack = 12) {
  return safeQuery("getTransactionVelocityTrend", [] as { month: string; count: number }[], async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    const rows = await prisma.transaction.findMany({
      where: { registrationDate: { gte: since } },
      select: { valuePaise: true, registrationDate: true, pricePerSqftPaise: true },
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

export async function getIngestBatch(id: string) {
  return safeQuery("getIngestBatch", null, () => prisma.ingestBatch.findUnique({ where: { id } }));
}

export async function getIngestLogForBatch(batchId: string) {
  return safeQuery("getIngestLogForBatch", [], () =>
    prisma.ingestLogEntry.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } })
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

export async function getUserForEdit(id: string) {
  return safeQuery("getUserForEdit", null, () =>
    prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, isActive: true } })
  );
}
