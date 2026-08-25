import { Prisma } from "@prisma/client";
import { ProjectAnalyticsService } from "@/lib/analytics";
import { pickCardImageUrl } from "@/lib/project-meta";

/** Shared Prisma `include` shape every candidate query in this module uses — one place, so every candidate source produces an identical, ProjectCard-ready shape. */
export const RECOMMENDATION_PROJECT_INCLUDE = {
  locality: { include: { zone: true } },
  builder: true,
  images: { orderBy: { sortOrder: "asc" as const }, take: 8 },
  configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
} satisfies Prisma.ProjectInclude;

type ProjectWithCard = Prisma.ProjectGetPayload<{ include: typeof RECOMMENDATION_PROJECT_INCLUDE }>;

/** Mirrors lib/queries/index.ts's private mapping (getRelatedProjects/getFeaturedProjects) exactly, reusing the same ProjectAnalyticsService calculator so recommendation cards render identically to every other project card on the site. */
export function mapProjectToCard(p: ProjectWithCard) {
  const { configurationSummary, pricePerSqftPaise } = ProjectAnalyticsService.calculateCardFields(p.configurations);
  return {
    id: p.id,
    slug: p.slug,
    localityId: p.localityId,
    builderId: p.builderId,
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
    possessionMonth: p.possessionMonth,
    possessionYear: p.possessionYear,
    totalUnits: p.totalUnits,
    totalTowers: p.totalTowers,
    landAreaAcres: p.landAreaAcres !== null ? Number(p.landAreaAcres) : null,
    paymentPlanType: p.paymentPlanType,
    paymentPlanDescription: p.paymentPlanDescription,
    dataSource: p.dataSource,
    imageUrl: pickCardImageUrl(p.images),
    brochureUrl: p.brochureUrl,
    brochureFileName: p.brochureFileName,
    brochureThumbnailUrl: p.brochureThumbnailUrl,
  };
}
