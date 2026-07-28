import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MarketAnalyticsService, ProjectAnalyticsService } from "@/lib/analytics";
import { PRIMARY_CITY_SLUG } from "./shared";

/**
 * Report-only queries — everything a Reports page needs that isn't already
 * covered by lib/queries/index.ts or lib/queries/transactions.ts. Fetches
 * raw rows only; every statistic/score/ranking is delegated to the Analytics
 * Engine (lib/analytics), same rule as the rest of the query layer.
 */

export interface MarketBaseline {
  avgPricePerSqftPaise: number | null;
  avgGrowthPercentYoy: number | null;
  avgLocalityInvestmentScore: number | null;
  avgBuilderScore: number | null;
}

/** City-wide averages used as the "vs market" comparison baseline on every report. */
export async function getMarketBaseline(): Promise<MarketBaseline> {
  const [localityAgg, builders] = await Promise.all([
    prisma.locality.aggregate({
      where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false },
      _avg: { avgPricePerSqftPaise: true, growthPercentYoy: true, investmentScore: true },
    }),
    prisma.builder.findMany({
      where: { isPublished: true, isArchived: false, scoreSnapshots: { some: {} } },
      select: { scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1, select: { overallScore: true } } },
    }),
  ]);

  const builderScores = builders
    .map((b) => b.scoreSnapshots[0])
    .filter((s): s is { overallScore: Prisma.Decimal } => s !== undefined)
    .map((s) => Number(s.overallScore));

  return {
    avgPricePerSqftPaise: localityAgg._avg.avgPricePerSqftPaise !== null ? Number(localityAgg._avg.avgPricePerSqftPaise) : null,
    avgGrowthPercentYoy: localityAgg._avg.growthPercentYoy !== null ? Number(localityAgg._avg.growthPercentYoy) : null,
    avgLocalityInvestmentScore: localityAgg._avg.investmentScore !== null ? Number(localityAgg._avg.investmentScore) : null,
    avgBuilderScore: MarketAnalyticsService.calculateAverage(builderScores),
  };
}

/** Projects ranked by registered-transaction count — the Transaction Report's "Related Projects". */
export async function getTopProjectsByActivity(limit = 6) {
  const grouped = await prisma.transaction.groupBy({
    by: ["projectId"],
    where: { projectId: { not: null }, locality: { city: { slug: PRIMARY_CITY_SLUG } }, deletedAt: null },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const ranked = MarketAnalyticsService.rankByCountDesc(
    grouped.filter((g): g is typeof g & { projectId: string } => g.projectId !== null),
    (g) => g._count._all,
    limit * 2 // over-fetch: some may resolve to unpublished projects, filtered out below
  );

  const projects = await prisma.project.findMany({
    where: { id: { in: ranked.map((g) => g.projectId) }, isPublished: true, isArchived: false },
    include: {
      locality: { include: { zone: true } },
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const orderedProjects = ranked.map((g) => projectById.get(g.projectId)).filter((p): p is NonNullable<typeof p> => p !== undefined);

  return orderedProjects.slice(0, limit).map((p) => {
    const { configurationSummary, pricePerSqftPaise } = ProjectAnalyticsService.calculateCardFields(p.configurations);
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
      imageUrl: p.images[0]?.url ?? null,
    };
  });
}
