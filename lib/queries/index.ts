import { cache } from "react";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { pickCardImageUrl } from "@/lib/project-meta";
import {
  DeveloperAnalyticsService,
  LocalityAnalyticsService,
  MarketAnalyticsService,
  ProjectAnalyticsService,
  DELIVERED_STATUSES as BUILDER_DELIVERED_STATUSES,
  UNDER_CONSTRUCTION_STATUSES as BUILDER_UNDER_CONSTRUCTION_STATUSES,
  UPCOMING_STATUSES as BUILDER_UPCOMING_STATUSES,
  type LocalityIntelligence,
} from "@/lib/analytics";
export type { LocalityIntelligence };

export { PRIMARY_CITY_SLUG } from "./shared";
import { PRIMARY_CITY_SLUG } from "./shared";

// Transaction intelligence lives in its own module — self-contained (no
// other domain reaches into its internals), so it was the first cut when
// this file was split out of one 1700+ line lib/queries.ts. Re-exported here
// so `from "@/lib/queries"` keeps working unchanged everywhere.
export * from "./transactions";

// Report-only queries (Market Baseline comparisons, activity rankings) — same
// split rationale as transactions.ts above.
export * from "./reports";

// Map-only queries (full unfiltered marker datasets) — same split rationale as transactions.ts above.
export * from "./map";

interface ConfigForCard {
  bedrooms: Prisma.Decimal;
  carpetSqft: Prisma.Decimal | null;
  priceMinPaise: bigint | null;
}

/** Shared by every project-card query — "2, 3 BHK" summary + an approximate blended ₹/sqft. Delegates to ProjectAnalyticsService. */
function deriveProjectCardFields(configurations: ConfigForCard[]): { configurationSummary: string | null; pricePerSqftPaise: number | null } {
  return ProjectAnalyticsService.calculateCardFields(configurations);
}

export async function getPrimaryCity() {
  return prisma.city.findUnique({
    where: { slug: PRIMARY_CITY_SLUG },
  });
}

export async function getLocalities() {
  return prisma.locality.findMany({
    where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false },
    include: { zone: true },
    orderBy: { name: "asc" },
  });
}

export interface MarketSnapshot {
  liveProjectsCount: number;
  localitiesCount: number;
  transactionsCount: number;
  transactions90dCount: number;
  avgPricePerSqftPaise: number | null;
  buildersCount: number;
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [
    liveProjectsCount,
    localitiesCount,
    transactionsCount,
    transactions90dCount,
    avgPricePerSqft,
    buildersCount,
  ] = await Promise.all([
    prisma.project.count({
      where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true },
    }),
    prisma.locality.count({ where: { city: { slug: PRIMARY_CITY_SLUG } } }),
    prisma.transaction.count({
      where: { locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
    }),
    prisma.transaction.count({
      where: {
        locality: { city: { slug: PRIMARY_CITY_SLUG } },
        registrationDate: { gte: ninetyDaysAgo },
        deletedAt: null,
      },
    }),
    prisma.transaction.aggregate({
      where: { locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
      _avg: { pricePerSqftPaise: true },
    }),
    prisma.builder.count(),
  ]);

  return {
    liveProjectsCount,
    localitiesCount,
    transactionsCount,
    transactions90dCount,
    avgPricePerSqftPaise: avgPricePerSqft._avg.pricePerSqftPaise
      ? Number(avgPricePerSqft._avg.pricePerSqftPaise)
      : null,
    buildersCount,
  };
}

/** Featured Projects homepage rail — isFeatured first, falls back to most-recently-updated so the section is never empty while curation is still thin. */
export async function getFeaturedProjects(limit = 6) {
  const where: Prisma.ProjectWhereInput = { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false };
  const include = {
    locality: { include: { zone: true } },
    builder: true,
    images: { orderBy: { sortOrder: "asc" as const }, take: 8 },
    configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
  };

  let projects = await prisma.project.findMany({
    where: { ...where, isFeatured: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include,
  });
  if (projects.length < limit) {
    const fillerIds = projects.map((p) => p.id);
    const filler = await prisma.project.findMany({
      where: { ...where, id: { notIn: fillerIds } },
      orderBy: { updatedAt: "desc" },
      take: limit - projects.length,
      include,
    });
    projects = [...projects, ...filler];
  }

  return projects.map((project) => {
    const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(project.configurations);
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      tagline: project.tagline,
      status: project.status,
      category: project.category,
      localityName: project.locality.name,
      zoneName: project.locality.zone?.name ?? null,
      builderName: project.builder?.name ?? null,
      builderLogoUrl: project.builder?.logoUrl ?? null,
      configurationSummary,
      pricePerSqftPaise,
      priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
      priceMaxPaise: project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null,
      possessionDate: project.promisedPossession,
      constructionPercent: project.constructionPercent,
      dataSource: project.dataSource,
      imageUrl: pickCardImageUrl(project.images),
      brochureUrl: project.brochureUrl,
      brochureFileName: project.brochureFileName,
      brochureThumbnailUrl: project.brochureThumbnailUrl,
    };
  });
}

/** A public user's bookmarked projects for the /account "Saved Projects" list, newest bookmark first. */
export async function getSavedProjectsForUser(publicUserId: string) {
  // `select` (not `include`) at every level — only the ~15 fields the mapped
  // card output below actually reads, not every scalar column of Project
  // plus full builder/locality.zone rows (this page's queries are on the hot
  // path for "feels slow" navigations between account tabs).
  const saved = await prisma.savedProject.findMany({
    where: { publicUserId },
    orderBy: { createdAt: "desc" },
    select: {
      project: {
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          status: true,
          category: true,
          priceMinPaise: true,
          priceMaxPaise: true,
          promisedPossession: true,
          constructionPercent: true,
          dataSource: true,
          brochureUrl: true,
          brochureFileName: true,
          brochureThumbnailUrl: true,
          locality: { select: { name: true, zone: { select: { name: true } } } },
          builder: { select: { name: true, logoUrl: true } },
          images: { orderBy: { sortOrder: "asc" as const }, take: 8, select: { url: true, kind: true } },
          configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
        },
      },
    },
  });

  return saved.map(({ project }) => {
    const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(project.configurations);
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      tagline: project.tagline,
      status: project.status,
      category: project.category,
      localityName: project.locality.name,
      zoneName: project.locality.zone?.name ?? null,
      builderName: project.builder?.name ?? null,
      builderLogoUrl: project.builder?.logoUrl ?? null,
      configurationSummary,
      pricePerSqftPaise,
      priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
      priceMaxPaise: project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null,
      possessionDate: project.promisedPossession,
      constructionPercent: project.constructionPercent,
      dataSource: project.dataSource,
      imageUrl: pickCardImageUrl(project.images),
      brochureUrl: project.brochureUrl,
      brochureFileName: project.brochureFileName,
      brochureThumbnailUrl: project.brochureThumbnailUrl,
    };
  });
}

/** New-launch rail — announced/pre-launch projects, most recently launched first. */
export async function getLatestLaunches(limit = 6) {
  const projects = await prisma.project.findMany({
    where: {
      city: { slug: PRIMARY_CITY_SLUG },
      isPublished: true,
      isArchived: false,
      status: { in: ["ANNOUNCED", "PRE_LAUNCH"] },
    },
    orderBy: [{ launchDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      locality: { include: { zone: true } },
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 8 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  });

  return projects.map((project) => {
    const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(project.configurations);
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      tagline: project.tagline,
      status: project.status,
      localityName: project.locality.name,
      zoneName: project.locality.zone?.name ?? null,
      builderName: project.builder?.name ?? null,
      builderLogoUrl: project.builder?.logoUrl ?? null,
      configurationSummary,
      pricePerSqftPaise,
      priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
      priceMaxPaise: project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null,
      possessionDate: project.promisedPossession,
      constructionPercent: project.constructionPercent,
      dataSource: project.dataSource,
      imageUrl: pickCardImageUrl(project.images),
      brochureUrl: project.brochureUrl,
      brochureFileName: project.brochureFileName,
      brochureThumbnailUrl: project.brochureThumbnailUrl,
    };
  });
}

interface ProjectForBuilderCard {
  status: ProjectStatus;
  name: string;
  launchDate: Date | null;
  createdAt: Date;
  isFeatured: boolean;
  priceMinPaise: bigint | null;
  cityId: string;
}

/** Shared by every builder-card query — status split, portfolio breadth, starting price and featured project. Delegates to DeveloperAnalyticsService. */
function deriveBuilderCardFields(projects: ProjectForBuilderCard[]) {
  return DeveloperAnalyticsService.calculatePortfolioBreakdown(projects);
}

/** Delegates to DeveloperAnalyticsService — our own heuristic, documented there. */
function computeBuilderInvestmentScore(overallScore: number | null, onTimeDeliveryPct: number | null, totalProjects: number): number | null {
  return DeveloperAnalyticsService.calculateInvestmentScore(overallScore, onTimeDeliveryPct, totalProjects);
}

function yearsInBusiness(foundedYear: number | null): number | null {
  return DeveloperAnalyticsService.calculateYearsInBusiness(foundedYear);
}

const BUILDER_CARD_PROJECT_SELECT = {
  status: true,
  name: true,
  launchDate: true,
  createdAt: true,
  isFeatured: true,
  priceMinPaise: true,
  cityId: true,
} satisfies Prisma.ProjectSelect;

function mapBuilderCard(builder: {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  headquarters: string | null;
  foundedYear: number | null;
  _count: { projects: number };
  scoreSnapshots: { overallScore: Prisma.Decimal; onTimeDeliveryPct: Prisma.Decimal | null }[];
  projects: ProjectForBuilderCard[];
}) {
  const { deliveredCount, underConstructionCount, upcomingCount, activeCount, latestLaunchName, featuredProjectName, startingPricePaise, cityCount } =
    deriveBuilderCardFields(builder.projects);
  const overallScore = builder.scoreSnapshots[0] ? Number(builder.scoreSnapshots[0].overallScore) : null;
  const onTimeDeliveryPct = builder.scoreSnapshots[0]?.onTimeDeliveryPct !== null && builder.scoreSnapshots[0]?.onTimeDeliveryPct !== undefined
    ? Number(builder.scoreSnapshots[0].onTimeDeliveryPct)
    : null;
  return {
    id: builder.id,
    slug: builder.slug,
    name: builder.name,
    logoUrl: builder.logoUrl,
    headquarters: builder.headquarters,
    foundedYear: builder.foundedYear,
    yearsInBusiness: yearsInBusiness(builder.foundedYear),
    projectCount: builder._count.projects,
    deliveredCount,
    underConstructionCount,
    upcomingCount,
    activeCount,
    cityCount,
    startingPricePaise,
    latestLaunchName,
    featuredProjectName,
    overallScore,
    onTimeDeliveryPct,
    investmentScore: computeBuilderInvestmentScore(overallScore, onTimeDeliveryPct, builder._count.projects),
  };
}

export async function getFeaturedBuilders(limit = 4) {
  const builders = await prisma.builder.findMany({
    where: { isPublished: true, isArchived: false },
    take: limit,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      _count: { select: { projects: true } },
      projects: { where: { isPublished: true, isArchived: false }, select: BUILDER_CARD_PROJECT_SELECT },
    },
  });

  return builders.map(mapBuilderCard);
}

export async function getTopDevelopers(limit = 4) {
  const builders = await prisma.builder.findMany({
    where: { isPublished: true, isArchived: false, scoreSnapshots: { some: {} } },
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      _count: { select: { projects: true } },
      projects: { where: { isPublished: true, isArchived: false }, select: BUILDER_CARD_PROJECT_SELECT },
    },
  });
  return MarketAnalyticsService.rankByScoreDesc(builders.map(mapBuilderCard), (b) => b.overallScore, limit);
}

export async function getNewestDevelopers(limit = 4) {
  const builders = await prisma.builder.findMany({
    where: { isPublished: true, isArchived: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      _count: { select: { projects: true } },
      projects: { where: { isPublished: true, isArchived: false }, select: BUILDER_CARD_PROJECT_SELECT },
    },
  });
  return builders.map(mapBuilderCard);
}

export async function getRecentlyActiveDevelopers(limit = 4) {
  const grouped = await prisma.transaction.groupBy({
    by: ["projectId"],
    where: { project: { isPublished: true, isArchived: false, builderId: { not: null } }, deletedAt: null },
    _max: { registrationDate: true },
  });
  if (grouped.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: grouped.map((g) => g.projectId).filter((id): id is string => id !== null) } },
    select: { id: true, builderId: true },
  });
  const lastActivityByBuilder = new Map<string, Date>();
  const projectToBuilder = new Map(projects.map((p) => [p.id, p.builderId]));
  for (const g of grouped) {
    if (!g.projectId || !g._max.registrationDate) continue;
    const builderId = projectToBuilder.get(g.projectId);
    if (!builderId) continue;
    const existing = lastActivityByBuilder.get(builderId);
    if (!existing || g._max.registrationDate > existing) lastActivityByBuilder.set(builderId, g._max.registrationDate);
  }

  const builderIds = MarketAnalyticsService.rankByDateDesc(Array.from(lastActivityByBuilder.entries()), (entry) => entry[1], limit).map(
    ([id]) => id
  );
  if (builderIds.length === 0) return [];

  const builders = await prisma.builder.findMany({
    where: { id: { in: builderIds }, isPublished: true, isArchived: false },
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      _count: { select: { projects: true } },
      projects: { where: { isPublished: true, isArchived: false }, select: BUILDER_CARD_PROJECT_SELECT },
    },
  });
  const cards = builders.map(mapBuilderCard);
  const orderIndex = new Map(builderIds.map((id, i) => [id, i]));
  return cards.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
}

export async function getLatestTransactions(limit = 8) {
  const transactions = await prisma.transaction.findMany({
    where: { locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
    orderBy: { registrationDate: "desc" },
    take: limit,
    include: { locality: true, project: true },
  });

  return transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    registrationDate: tx.registrationDate,
    valuePaise: Number(tx.valuePaise),
    pricePerSqftPaise: tx.pricePerSqftPaise !== null ? Number(tx.pricePerSqftPaise) : null,
    carpetSqft: tx.carpetSqft !== null ? Number(tx.carpetSqft) : null,
    localityName: tx.locality.name,
    projectName: tx.project?.name ?? null,
    dataSource: tx.dataSource,
  }));
}

export interface PriceTrendPoint {
  month: Date;
  avgPricePerSqftPaise: number;
}

export async function getCityPriceTrend(months = 12): Promise<PriceTrendPoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const points = await prisma.priceHistoryPoint.findMany({
    where: {
      project: { city: { slug: PRIMARY_CITY_SLUG } },
      month: { gte: since },
    },
    orderBy: { month: "asc" },
    select: { month: true, avgPricePerSqftPaise: true },
  });

  const byMonth = new Map<string, { sum: number; count: number; month: Date }>();
  for (const point of points) {
    const key = point.month.toISOString().slice(0, 7);
    const bucket = byMonth.get(key) ?? { sum: 0, count: 0, month: point.month };
    bucket.sum += Number(point.avgPricePerSqftPaise);
    bucket.count += 1;
    byMonth.set(key, bucket);
  }

  return Array.from(byMonth.values())
    .sort((a, b) => a.month.getTime() - b.month.getTime())
    .map((bucket) => ({
      month: bucket.month,
      avgPricePerSqftPaise: bucket.sum / bucket.count,
    }));
}

export interface LocalityInsight {
  localityId: string;
  localityName: string;
  transactionCount: number;
  avgPricePerSqftPaise: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Public project listing + detail page. These NEVER return unpublished or
// archived projects — that boundary is enforced here, not by the caller, so
// a draft can never leak onto the public site by a page forgetting a filter.
// ─────────────────────────────────────────────────────────────────────────

export interface PublicProjectFilters {
  q?: string;
  localityId?: string;
  builderId?: string;
  status?: string;
  category?: string;
  bedrooms?: string;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  possession?: string;
  hasRera?: boolean;
  isLuxury?: boolean;
  isAffordable?: boolean;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

function publicPossessionRange(possession: string | undefined): { lte?: Date; gte?: Date } | null {
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

function publicProjectOrderBy(sortBy: string | undefined): Prisma.ProjectOrderByWithRelationInput {
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

export interface PublicSearchResult {
  projects: { id: string; slug: string; name: string; localityName: string }[];
  builders: { id: string; slug: string; name: string }[];
  localities: { id: string; slug: string; name: string }[];
}

/** Cross-entity search for the public global search box — published/non-archived only. */
export async function searchPublic(query: string): Promise<PublicSearchResult> {
  const empty: PublicSearchResult = { projects: [], builders: [], localities: [] };
  const trimmed = query.trim();
  if (!trimmed) return empty;

  const [projects, builders, localities] = await Promise.all([
    prisma.project.findMany({
      where: { name: { contains: trimmed, mode: "insensitive" }, isPublished: true, isArchived: false },
      select: { id: true, slug: true, name: true, locality: { select: { name: true } } },
      take: 5,
    }),
    prisma.builder.findMany({
      where: { name: { contains: trimmed, mode: "insensitive" }, isPublished: true, isArchived: false },
      select: { id: true, slug: true, name: true },
      take: 5,
    }),
    prisma.locality.findMany({
      where: { name: { contains: trimmed, mode: "insensitive" }, isPublished: true, isArchived: false },
      select: { id: true, slug: true, name: true },
      take: 5,
    }),
  ]);

  return {
    projects: projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name, localityName: p.locality.name })),
    builders,
    localities,
  };
}

export async function getPublicProjectsPaged(filters: PublicProjectFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));

  const where: Prisma.ProjectWhereInput = {
    city: { slug: PRIMARY_CITY_SLUG },
    isPublished: true,
    isArchived: false,
  };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { tagline: { contains: filters.q, mode: "insensitive" } },
      { locality: { name: { contains: filters.q, mode: "insensitive" } } },
      { builder: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.localityId) where.localityId = filters.localityId;
  if (filters.builderId) where.builderId = filters.builderId;
  if (filters.status) where.status = filters.status as ProjectStatus;
  if (filters.category) where.category = filters.category as Prisma.ProjectWhereInput["category"];
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
  const possessionRange = publicPossessionRange(filters.possession);
  if (possessionRange) where.promisedPossession = possessionRange;
  if (filters.hasRera !== undefined) where.reraNumber = filters.hasRera ? { not: null } : null;
  if (filters.isLuxury) where.isLuxury = true;
  if (filters.isAffordable) where.isAffordable = true;

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: publicProjectOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        locality: { include: { zone: true } },
        builder: true,
        images: { orderBy: { sortOrder: "asc" }, take: 8 },
        configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    items: items.map((project) => {
      const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(project.configurations);
      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        tagline: project.tagline,
        status: project.status,
        localityName: project.locality.name,
        zoneName: project.locality.zone?.name ?? null,
        builderName: project.builder?.name ?? null,
        builderLogoUrl: project.builder?.logoUrl ?? null,
        configurationSummary,
        pricePerSqftPaise,
        priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
        priceMaxPaise: project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null,
        possessionDate: project.promisedPossession,
        constructionPercent: project.constructionPercent,
        dataSource: project.dataSource,
        imageUrl: pickCardImageUrl(project.images),
        brochureUrl: project.brochureUrl,
        brochureFileName: project.brochureFileName,
        brochureThumbnailUrl: project.brochureThumbnailUrl,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** cache()-wrapped: generateMetadata and the page component both fetch this per request — dedupe to one query. */
export const getPublicProjectBySlug = cache(async (slug: string) => {
  const project = await prisma.project.findFirst({
    where: { slug, isPublished: true, isArchived: false },
    include: {
      locality: { include: { zone: true, city: true } },
      microMarket: true,
      builder: { include: { scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 } } },
      images: { orderBy: { sortOrder: "asc" } },
      configurations: { orderBy: { sortOrder: "asc" } },
      amenities: { include: { amenity: true } },
      specifications: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { sortOrder: "asc" } },
      timelineEvents: { orderBy: { sortOrder: "asc" } },
      faqs: { orderBy: { sortOrder: "asc" } },
      sections: { orderBy: { sortOrder: "asc" } },
      infraLinks: { include: { infra: true }, orderBy: { distanceMeters: "asc" } },
      investmentNotes: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!project) return null;

  const { pricePerSqftPaise: configPricePerSqftPaise } = deriveProjectCardFields(project.configurations);
  const builderOverallScore = project.builder?.scoreSnapshots[0] ? Number(project.builder.scoreSnapshots[0].overallScore) : null;
  const localityInvestmentScore = project.locality.investmentScore !== null ? Number(project.locality.investmentScore) : null;
  const localityRentalYieldPercent = project.locality.rentalYieldPercent !== null ? Number(project.locality.rentalYieldPercent) : null;

  return {
    ...project,
    landAreaAcres: project.landAreaAcres !== null ? Number(project.landAreaAcres) : null,
    configurations: project.configurations.map((c) => ({
      ...c,
      bedrooms: Number(c.bedrooms),
      carpetSqft: c.carpetSqft !== null ? Number(c.carpetSqft) : null,
      builtUpSqft: c.builtUpSqft !== null ? Number(c.builtUpSqft) : null,
    })),
    builder: project.builder
      ? {
          ...project.builder,
          overallScore: builderOverallScore,
        }
      : null,
    configPricePerSqftPaise,
    localityInvestmentScore,
    localityRentalYieldPercent,
    builderOverallScore,
  };
});

/** Delegates to ProjectAnalyticsService — our own heuristic, documented there. */
export function computeProjectInvestmentScore(
  localityInvestmentScore: number | null,
  builderOverallScore: number | null,
  totalTransactions: number
): number | null {
  return ProjectAnalyticsService.calculateInvestmentScore(localityInvestmentScore, builderOverallScore, totalTransactions);
}

export async function getRelatedProjects(project: { id: string; localityId: string; builderId: string | null }, limit = 4) {
  return prisma.project.findMany({
    where: {
      id: { not: project.id },
      isPublished: true,
      isArchived: false,
      OR: [{ localityId: project.localityId }, ...(project.builderId ? [{ builderId: project.builderId }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      locality: { include: { zone: true } },
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 8 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  }).then((projects) =>
    projects.map((p) => {
      const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(p.configurations);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        status: p.status,
        localityName: p.locality.name,
        zoneName: p.locality.zone?.name ?? null,
        builderName: p.builder?.name ?? null,
        builderLogoUrl: p.builder?.logoUrl ?? null,
        configurationSummary,
        pricePerSqftPaise,
        priceMinPaise: p.priceMinPaise !== null ? Number(p.priceMinPaise) : null,
        priceMaxPaise: p.priceMaxPaise !== null ? Number(p.priceMaxPaise) : null,
        possessionDate: p.promisedPossession,
        constructionPercent: p.constructionPercent,
        dataSource: p.dataSource,
        imageUrl: pickCardImageUrl(p.images),
        brochureUrl: p.brochureUrl,
        brochureFileName: p.brochureFileName,
        brochureThumbnailUrl: p.brochureThumbnailUrl,
      };
    })
  );
}

export async function getProjectPriceHistory(projectId: string) {
  const points = await prisma.priceHistoryPoint.findMany({
    where: { projectId },
    orderBy: { month: "asc" },
  });
  return points.map((p) => ({ month: p.month, avgPricePerSqftPaise: Number(p.avgPricePerSqftPaise), sampleSize: p.sampleSize }));
}

export async function getProjectTransactionHistory(projectId: string, limit = 20) {
  const transactions = await prisma.transaction.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { registrationDate: "desc" },
    take: limit,
  });
  return transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    registrationDate: tx.registrationDate,
    valuePaise: Number(tx.valuePaise),
    pricePerSqftPaise: tx.pricePerSqftPaise !== null ? Number(tx.pricePerSqftPaise) : null,
    carpetSqft: tx.carpetSqft !== null ? Number(tx.carpetSqft) : null,
    bedrooms: tx.bedrooms !== null ? Number(tx.bedrooms) : null,
    tower: tx.tower,
    dataSource: tx.dataSource,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Public builder directory + profile. Same isPublished/isArchived boundary
// enforced here as the project queries above.
// ─────────────────────────────────────────────────────────────────────────

export interface PublicBuilderFilters {
  q?: string;
  cityId?: string;
  minActiveProjects?: number;
  minDeliveredProjects?: number;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

function publicBuilderOrderBy(sortBy: string | undefined): Prisma.BuilderOrderByWithRelationInput {
  switch (sortBy) {
    case "name_asc":
      return { name: "asc" };
    case "founded_asc":
      return { foundedYear: "asc" };
    case "projects_desc":
      return { projects: { _count: "desc" } };
    default:
      return { createdAt: "desc" };
  }
}

export async function getCitiesForSelect() {
  const cities = await prisma.city.findMany({
    where: { isLive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return cities;
}

/** "At least N" project-count filters can't be expressed as a plain Prisma where, so we
 * pre-resolve qualifying builder ids via groupBy, then intersect with the main query. */
async function builderIdsWithMinProjectCount(statuses: ProjectStatus[], min: number): Promise<string[]> {
  const grouped = await prisma.project.groupBy({
    by: ["builderId"],
    where: { builderId: { not: null }, isPublished: true, isArchived: false, status: { in: statuses } },
    _count: { _all: true },
  });
  return grouped.filter((g) => g._count._all >= min).map((g) => g.builderId as string);
}

export async function getPublicBuildersPaged(filters: PublicBuilderFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));

  const where: Prisma.BuilderWhereInput = { isPublished: true, isArchived: false };
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { headquarters: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.cityId || filters.priceMinRupees !== undefined || filters.priceMaxRupees !== undefined) {
    const priceFilter: { gte?: bigint; lte?: bigint } = {};
    if (filters.priceMinRupees !== undefined) priceFilter.gte = BigInt(Math.round(filters.priceMinRupees * 100));
    if (filters.priceMaxRupees !== undefined) priceFilter.lte = BigInt(Math.round(filters.priceMaxRupees * 100));
    where.projects = {
      some: {
        isPublished: true,
        isArchived: false,
        ...(filters.cityId ? { cityId: filters.cityId } : {}),
        ...(Object.keys(priceFilter).length > 0 ? { priceMinPaise: priceFilter } : {}),
      },
    };
  }

  const idFilters: string[][] = [];
  if (filters.minActiveProjects !== undefined && filters.minActiveProjects > 0) {
    idFilters.push(
      await builderIdsWithMinProjectCount([...BUILDER_UNDER_CONSTRUCTION_STATUSES, ...BUILDER_UPCOMING_STATUSES], filters.minActiveProjects)
    );
  }
  if (filters.minDeliveredProjects !== undefined && filters.minDeliveredProjects > 0) {
    idFilters.push(await builderIdsWithMinProjectCount(BUILDER_DELIVERED_STATUSES, filters.minDeliveredProjects));
  }
  if (idFilters.length > 0) {
    const intersection = idFilters.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
    where.id = { in: intersection };
  }

  const [items, total] = await Promise.all([
    prisma.builder.findMany({
      where,
      orderBy: publicBuilderOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
        _count: { select: { projects: true } },
        projects: { where: { isPublished: true, isArchived: false }, select: BUILDER_CARD_PROJECT_SELECT },
      },
    }),
    prisma.builder.count({ where }),
  ]);

  return {
    items: items.map(mapBuilderCard),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const PRICE_BAND_LABELS = ["Under ₹1 Cr", "₹1-2 Cr", "₹2-5 Cr", "₹5-10 Cr", "₹10 Cr+"] as const;

function priceBandForPaise(paise: number): (typeof PRICE_BAND_LABELS)[number] {
  const rupees = paise / 100;
  if (rupees < 1e7) return "Under ₹1 Cr";
  if (rupees < 2e7) return "₹1-2 Cr";
  if (rupees < 5e7) return "₹2-5 Cr";
  if (rupees < 1e8) return "₹5-10 Cr";
  return "₹10 Cr+";
}

/** cache()-wrapped: generateMetadata and the page component both fetch this per request — dedupe to one query. */
export const getPublicBuilderBySlug = cache(async (slug: string) => {
  const builder = await prisma.builder.findFirst({
    where: { slug, isPublished: true, isArchived: false },
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" } },
      timeline: { orderBy: [{ year: "asc" }, { sortOrder: "asc" }] },
      amenities: { include: { amenity: true } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!builder) return null;

  const projects = await prisma.project.findMany({
    where: { builderId: builder.id, isPublished: true, isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      locality: { include: { zone: true } },
      city: true,
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 8 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  });

  const mappedProjects = projects.map((p) => {
    const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(p.configurations);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      status: p.status,
      localityName: p.locality.name,
      zoneName: p.locality.zone?.name ?? null,
      builderName: p.builder?.name ?? null,
      builderLogoUrl: p.builder?.logoUrl ?? null,
      configurationSummary,
      pricePerSqftPaise,
      priceMinPaise: p.priceMinPaise !== null ? Number(p.priceMinPaise) : null,
      priceMaxPaise: p.priceMaxPaise !== null ? Number(p.priceMaxPaise) : null,
      possessionDate: p.promisedPossession,
      launchDate: p.launchDate,
      constructionPercent: p.constructionPercent,
      dataSource: p.dataSource,
      imageUrl: pickCardImageUrl(p.images),
      brochureUrl: p.brochureUrl,
      brochureFileName: p.brochureFileName,
      brochureThumbnailUrl: p.brochureThumbnailUrl,
      cityId: p.cityId,
      cityName: p.city.name,
    };
  });

  const completedProjects = mappedProjects.filter((p) => BUILDER_DELIVERED_STATUSES.includes(p.status));
  const underConstructionProjects = mappedProjects.filter((p) => BUILDER_UNDER_CONSTRUCTION_STATUSES.includes(p.status));
  const upcomingProjects = mappedProjects.filter((p) => BUILDER_UPCOMING_STATUSES.includes(p.status));

  const citiesServed = Array.from(
    mappedProjects.reduce((acc, p) => {
      const entry = acc.get(p.cityId) ?? { cityId: p.cityId, cityName: p.cityName, projectCount: 0 };
      entry.projectCount += 1;
      acc.set(p.cityId, entry);
      return acc;
    }, new Map<string, { cityId: string; cityName: string; projectCount: number }>())
  )
    .map(([, v]) => v)
    .sort((a, b) => b.projectCount - a.projectCount);

  const projectsByStatus = DeveloperAnalyticsService.calculatePortfolioByStatus(mappedProjects);

  const priceDistribution = PRICE_BAND_LABELS.map((label) => ({
    label,
    count: mappedProjects.filter((p) => p.priceMinPaise !== null && priceBandForPaise(p.priceMinPaise) === label).length,
  })).filter((b) => b.count > 0);

  const overallScore = builder.scoreSnapshots[0] ? Number(builder.scoreSnapshots[0].overallScore) : null;
  const onTimeDeliveryPct = builder.scoreSnapshots[0]?.onTimeDeliveryPct !== null && builder.scoreSnapshots[0]?.onTimeDeliveryPct !== undefined
    ? Number(builder.scoreSnapshots[0].onTimeDeliveryPct)
    : null;

  return {
    ...builder,
    scoreSnapshots: builder.scoreSnapshots.map((s) => ({
      ...s,
      overallScore: Number(s.overallScore),
      onTimeDeliveryPct: s.onTimeDeliveryPct !== null ? Number(s.onTimeDeliveryPct) : null,
      avgDelayMonths: s.avgDelayMonths !== null ? Number(s.avgDelayMonths) : null,
    })),
    projects: mappedProjects,
    completedProjects,
    underConstructionProjects,
    upcomingProjects,
    citiesServed,
    projectsByStatus,
    priceDistribution,
    yearsInBusiness: yearsInBusiness(builder.foundedYear),
    investmentScore: computeBuilderInvestmentScore(overallScore, onTimeDeliveryPct, mappedProjects.length),
  };
});

export async function getLocalitiesForBuilder(builderId: string, limit = 8) {
  const projects = await prisma.project.findMany({
    where: { builderId, isPublished: true, isArchived: false },
    select: { localityId: true },
  });
  const localityIds = Array.from(new Set(projects.map((p) => p.localityId)));
  if (localityIds.length === 0) return [];

  const localities = await prisma.locality.findMany({
    where: { id: { in: localityIds }, isPublished: true, isArchived: false },
    include: {
      zone: true,
      projects: { where: { isPublished: true, isArchived: false }, select: { builderId: true } },
    },
    take: limit,
  });

  return localities.map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    zoneName: l.zone?.name ?? null,
    coverImageUrl: l.coverImageUrl,
    avgPricePerSqftPaise: l.avgPricePerSqftPaise !== null ? Number(l.avgPricePerSqftPaise) : null,
    rentalYieldPercent: l.rentalYieldPercent !== null ? Number(l.rentalYieldPercent) : null,
    growthPercentYoy: l.growthPercentYoy !== null ? Number(l.growthPercentYoy) : null,
    investmentScore: l.investmentScore !== null ? Number(l.investmentScore) : null,
    projectCount: l.projects.length,
    builderCount: new Set(l.projects.map((p) => p.builderId).filter(Boolean)).size,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Public locality directory + profile. Same isPublished/isArchived boundary
// enforced here as the project and builder queries above.
// ─────────────────────────────────────────────────────────────────────────

export interface PublicLocalityFilters {
  q?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

function publicLocalityOrderBy(sortBy: string | undefined): Prisma.LocalityOrderByWithRelationInput {
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

export async function getPublicLocalitiesPaged(filters: PublicLocalityFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? 12));

  const where: Prisma.LocalityWhereInput = {
    city: { slug: PRIMARY_CITY_SLUG },
    isPublished: true,
    isArchived: false,
    deletedAt: null,
  };
  if (filters.q) {
    where.OR = [{ name: { contains: filters.q, mode: "insensitive" } }];
  }

  const [items, total] = await Promise.all([
    prisma.locality.findMany({
      where,
      orderBy: publicLocalityOrderBy(filters.sortBy),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        zone: true,
        _count: { select: { projects: true } },
        projects: { where: { isPublished: true, isArchived: false }, select: { builderId: true } },
      },
    }),
    prisma.locality.count({ where }),
  ]);

  return {
    items: items.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      zoneName: l.zone?.name ?? null,
      coverImageUrl: l.coverImageUrl,
      avgPricePerSqftPaise: l.avgPricePerSqftPaise !== null ? Number(l.avgPricePerSqftPaise) : null,
      rentalYieldPercent: l.rentalYieldPercent !== null ? Number(l.rentalYieldPercent) : null,
      growthPercentYoy: l.growthPercentYoy !== null ? Number(l.growthPercentYoy) : null,
      investmentScore: l.investmentScore !== null ? Number(l.investmentScore) : null,
      projectCount: l._count.projects,
      builderCount: new Set(l.projects.map((p) => p.builderId).filter(Boolean)).size,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** cache()-wrapped: generateMetadata and the page component both fetch this per request — dedupe to one query. */
export const getPublicLocalityBySlug = cache(async (slug: string) => {
  const locality = await prisma.locality.findFirst({
    where: { slug, city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false },
    include: {
      zone: true,
      city: true,
      microMarkets: { orderBy: { name: "asc" } },
      amenities: { include: { amenity: true } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!locality) return null;

  const projects = await prisma.project.findMany({
    where: { localityId: locality.id, isPublished: true, isArchived: false },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    include: {
      locality: { include: { zone: true } },
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 8 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  });

  return {
    ...locality,
    rentalYieldPercent: locality.rentalYieldPercent !== null ? Number(locality.rentalYieldPercent) : null,
    growthPercentYoy: locality.growthPercentYoy !== null ? Number(locality.growthPercentYoy) : null,
    investmentScore: locality.investmentScore !== null ? Number(locality.investmentScore) : null,
    endUserScore: locality.endUserScore !== null ? Number(locality.endUserScore) : null,
    luxuryScore: locality.luxuryScore !== null ? Number(locality.luxuryScore) : null,
    familyScore: locality.familyScore !== null ? Number(locality.familyScore) : null,
    projects: projects.map((p) => {
      const { configurationSummary, pricePerSqftPaise } = deriveProjectCardFields(p.configurations);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        status: p.status,
        localityName: p.locality.name,
        zoneName: p.locality.zone?.name ?? null,
        builderName: p.builder?.name ?? null,
        builderLogoUrl: p.builder?.logoUrl ?? null,
        configurationSummary,
        pricePerSqftPaise,
        priceMinPaise: p.priceMinPaise !== null ? Number(p.priceMinPaise) : null,
        priceMaxPaise: p.priceMaxPaise !== null ? Number(p.priceMaxPaise) : null,
        possessionDate: p.promisedPossession,
        constructionPercent: p.constructionPercent,
        dataSource: p.dataSource,
        imageUrl: pickCardImageUrl(p.images),
        brochureUrl: p.brochureUrl,
        brochureFileName: p.brochureFileName,
        brochureThumbnailUrl: p.brochureThumbnailUrl,
      };
    }),
  };
});

export async function getTopBuildersForLocality(localityId: string, limit = 5) {
  const projects = await prisma.project.findMany({
    where: { localityId, isPublished: true, isArchived: false, builderId: { not: null } },
    select: {
      builderId: true,
      status: true,
      builder: {
        select: { id: true, slug: true, name: true, logoUrl: true, scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 } },
      },
    },
  });

  const byBuilder = new Map<string, { slug: string; name: string; logoUrl: string | null; score: number | null; projectCount: number }>();
  for (const p of projects) {
    if (!p.builder) continue;
    const existing = byBuilder.get(p.builder.id);
    if (existing) {
      existing.projectCount += 1;
    } else {
      byBuilder.set(p.builder.id, {
        slug: p.builder.slug,
        name: p.builder.name,
        logoUrl: p.builder.logoUrl,
        score: p.builder.scoreSnapshots[0] ? Number(p.builder.scoreSnapshots[0].overallScore) : null,
        projectCount: 1,
      });
    }
  }

  return Array.from(byBuilder.values())
    .sort((a, b) => {
      if (a.score !== null && b.score !== null) return b.score - a.score;
      if (a.score !== null) return -1;
      if (b.score !== null) return 1;
      return b.projectCount - a.projectCount;
    })
    .slice(0, limit);
}

export async function getNearbyLocalities(localityId: string, limit = 6) {
  const locality = await prisma.locality.findUnique({
    where: { id: localityId },
    select: { cityId: true, zoneId: true, centroidLat: true, centroidLng: true },
  });
  if (!locality) return [];

  const candidates = await prisma.locality.findMany({
    where: { cityId: locality.cityId, id: { not: localityId }, isPublished: true, isArchived: false },
    include: {
      zone: true,
      projects: { where: { isPublished: true, isArchived: false }, select: { builderId: true } },
    },
  });

  const withDistance = candidates.map((c) => ({
    c,
    distance:
      locality.centroidLat !== null && locality.centroidLng !== null && c.centroidLat !== null && c.centroidLng !== null
        ? distanceMeters(locality.centroidLat, locality.centroidLng, c.centroidLat, c.centroidLng)
        : c.zoneId !== null && c.zoneId === locality.zoneId
          ? 0 // same zone, no coordinates — treat as adjacent
          : Number.POSITIVE_INFINITY,
  }));

  return withDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ c }) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      zoneName: c.zone?.name ?? null,
      coverImageUrl: c.coverImageUrl,
      avgPricePerSqftPaise: c.avgPricePerSqftPaise !== null ? Number(c.avgPricePerSqftPaise) : null,
      rentalYieldPercent: c.rentalYieldPercent !== null ? Number(c.rentalYieldPercent) : null,
      growthPercentYoy: c.growthPercentYoy !== null ? Number(c.growthPercentYoy) : null,
      investmentScore: c.investmentScore !== null ? Number(c.investmentScore) : null,
      projectCount: c.projects.length,
      builderCount: new Set(c.projects.map((p) => p.builderId).filter(Boolean)).size,
    }));
}

/** Fetches the raw counts/statuses; all scoring logic lives in LocalityAnalyticsService. */
export async function getLocalityIntelligence(
  localityId: string,
  localityName: string,
  curatedInvestmentScore: number | null,
  rentalYieldPercent: number | null,
  growthPercentYoy: number | null
): Promise<LocalityIntelligence> {
  const [recentTx, priorTx, projects] = await Promise.all([
    prisma.transaction.count({
      where: { localityId, registrationDate: { gte: new Date(new Date().setMonth(new Date().getMonth() - 3)) }, deletedAt: null },
    }),
    prisma.transaction.count({
      where: {
        localityId,
        registrationDate: {
          gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
          lt: new Date(new Date().setMonth(new Date().getMonth() - 3)),
        },
        deletedAt: null,
      },
    }),
    prisma.project.findMany({
      where: { localityId, isPublished: true, isArchived: false },
      select: { status: true },
    }),
  ]);

  return LocalityAnalyticsService.calculateIntelligence({
    localityName,
    recentTransactionCount: recentTx,
    priorTransactionCount: priorTx,
    projectStatuses: projects.map((p) => p.status),
    curatedInvestmentScore,
    rentalYieldPercent,
    growthPercentYoy,
  });
}

export async function getTopLocalitiesByActivity(limit = 3): Promise<LocalityInsight[]> {
  const grouped = await prisma.transaction.groupBy({
    by: ["localityId"],
    where: { locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
    _count: { _all: true },
    _avg: { pricePerSqftPaise: true },
    orderBy: { _count: { localityId: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const localities = await prisma.locality.findMany({
    where: { id: { in: grouped.map((g) => g.localityId) }, isPublished: true, isArchived: false },
  });
  const nameById = new Map(localities.map((l) => [l.id, l.name]));

  // An unpublished/archived locality has no entry in nameById — drop it
  // rather than surface it under a placeholder "Unknown" name.
  return grouped
    .filter((g) => nameById.has(g.localityId))
    .map((g) => ({
      localityId: g.localityId,
      localityName: nameById.get(g.localityId) as string,
      transactionCount: g._count._all,
      avgPricePerSqftPaise: g._avg.pricePerSqftPaise ? Number(g._avg.pricePerSqftPaise) : null,
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// /market-data and /insights — published-only aggregate views built from
// data already computed elsewhere, no new stored fields.
// ─────────────────────────────────────────────────────────────────────────

export async function getPublicLocalityMarketSnapshot() {
  const localities = await prisma.locality.findMany({
    where: {
      city: { slug: PRIMARY_CITY_SLUG },
      isPublished: true,
      isArchived: false,
      OR: [{ avgPricePerSqftPaise: { not: null } }, { rentalYieldPercent: { not: null } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, avgPricePerSqftPaise: true, rentalYieldPercent: true, growthPercentYoy: true },
  });
  return localities.map((l) => ({
    id: l.id,
    slug: l.slug,
    name: l.name,
    avgPricePerSqftPaise: l.avgPricePerSqftPaise !== null ? Number(l.avgPricePerSqftPaise) : null,
    rentalYieldPercent: l.rentalYieldPercent !== null ? Number(l.rentalYieldPercent) : null,
    growthPercentYoy: l.growthPercentYoy !== null ? Number(l.growthPercentYoy) : null,
  }));
}

export async function getPublicBuilderTrustLeaderboard(limit = 10) {
  const builders = await prisma.builder.findMany({
    where: { isPublished: true, isArchived: false, scoreSnapshots: { some: {} } },
    select: {
      id: true,
      slug: true,
      name: true,
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
    },
  });
  const scored = builders
    .filter((b) => b.scoreSnapshots.length > 0)
    .map((b) => ({ id: b.id, slug: b.slug, name: b.name, score: Number(b.scoreSnapshots[0].overallScore), asOf: b.scoreSnapshots[0].asOf }));
  return MarketAnalyticsService.rankByScoreDesc(scored, (b) => b.score, limit);
}

/** The most recent `updatedAt` across every published catalog/market table — a real "data last updated" freshness signal for the site footer, not a fabricated one. */
export async function getPlatformDataFreshness(): Promise<Date | null> {
  const [project, transaction, builder, locality] = await Promise.all([
    prisma.project.aggregate({ where: { isPublished: true, isArchived: false }, _max: { updatedAt: true } }),
    prisma.transaction.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
    prisma.builder.aggregate({ where: { isPublished: true, isArchived: false }, _max: { updatedAt: true } }),
    prisma.locality.aggregate({ where: { isPublished: true, isArchived: false }, _max: { updatedAt: true } }),
  ]);
  const dates = [project._max.updatedAt, transaction._max.updatedAt, builder._max.updatedAt, locality._max.updatedAt].filter(
    (d): d is Date => d !== null
  );
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}
