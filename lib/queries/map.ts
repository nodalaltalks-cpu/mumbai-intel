import { prisma } from "@/lib/prisma";
import { ProjectAnalyticsService, TransactionAnalyticsService } from "@/lib/analytics";
import type { DeveloperMapMarker, LocalityMapMarker, ProjectMapMarker } from "@/lib/map/types";
import { PRIMARY_CITY_SLUG } from "./shared";

/**
 * Map-only queries — fetch the full published/geolocated dataset once (no
 * pagination, no filter params): the Map page filters/searches entirely
 * client-side against this dataset for instant, network-free interaction.
 * Every derived figure (price/sqft, config summary, median price) is
 * delegated to the Analytics Engine, same rule as the rest of the query layer.
 */

export async function getProjectMapMarkers(): Promise<ProjectMapMarker[]> {
  const projects = await prisma.project.findMany({
    where: {
      city: { slug: PRIMARY_CITY_SLUG },
      isPublished: true,
      isArchived: false,
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      locality: true,
      builder: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      configurations: { select: { bedrooms: true, carpetSqft: true, priceMinPaise: true } },
    },
  });

  return projects.map((p) => {
    const { configurationSummary, pricePerSqftPaise } = ProjectAnalyticsService.calculateCardFields(p.configurations);
    return {
      kind: "project",
      id: p.id,
      slug: p.slug,
      name: p.name,
      builderName: p.builder?.name ?? null,
      builderSlug: p.builder?.slug ?? null,
      builderId: p.builderId,
      localityName: p.locality.name,
      localitySlug: p.locality.slug,
      localityId: p.localityId,
      status: p.status,
      category: p.category,
      bedroomOptions: Array.from(new Set(p.configurations.map((c) => Number(c.bedrooms)))),
      startingPricePaise: p.priceMinPaise !== null ? Number(p.priceMinPaise) : null,
      pricePerSqftPaise,
      configurationSummary,
      imageUrl: p.images[0]?.url ?? null,
      position: { lat: p.latitude as number, lng: p.longitude as number },
    };
  });
}

export async function getLocalityMapMarkers(): Promise<LocalityMapMarker[]> {
  const localities = await prisma.locality.findMany({
    where: {
      city: { slug: PRIMARY_CITY_SLUG },
      isPublished: true,
      isArchived: false,
      centroidLat: { not: null },
      centroidLng: { not: null },
    },
    include: {
      zone: true,
      _count: { select: { projects: { where: { isPublished: true, isArchived: false } } } },
    },
  });
  if (localities.length === 0) return [];

  const transactions = await prisma.transaction.findMany({
    where: { localityId: { in: localities.map((l) => l.id) } },
    select: { localityId: true, valuePaise: true },
  });
  const byLocality = new Map<string, { valuePaise: bigint }[]>();
  for (const tx of transactions) {
    const bucket = byLocality.get(tx.localityId) ?? [];
    bucket.push({ valuePaise: tx.valuePaise });
    byLocality.set(tx.localityId, bucket);
  }

  return localities.map((l) => {
    const localityTx = byLocality.get(l.id) ?? [];
    return {
      kind: "locality",
      id: l.id,
      slug: l.slug,
      name: l.name,
      zoneName: l.zone?.name ?? null,
      medianPricePaise: TransactionAnalyticsService.calculateMedianPrice(localityTx),
      avgPricePerSqftPaise: l.avgPricePerSqftPaise !== null ? Number(l.avgPricePerSqftPaise) : null,
      rentalYieldPercent: l.rentalYieldPercent !== null ? Number(l.rentalYieldPercent) : null,
      transactionCount: localityTx.length,
      projectCount: l._count.projects,
      position: { lat: l.centroidLat as number, lng: l.centroidLng as number },
      boundary: null,
    };
  });
}

/** Builder has no stored geo field, so a developer's map position is derived as the centroid of its own geolocated published projects — builders with none are omitted (Phase 13 spec: "where applicable"). */
export async function getDeveloperMapMarkers(): Promise<DeveloperMapMarker[]> {
  const builders = await prisma.builder.findMany({
    where: { isPublished: true, isArchived: false },
    include: {
      scoreSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      projects: {
        where: { city: { slug: PRIMARY_CITY_SLUG }, isPublished: true, isArchived: false, latitude: { not: null }, longitude: { not: null } },
        select: { latitude: true, longitude: true },
      },
    },
  });

  return builders
    .filter((b) => b.projects.length > 0)
    .map((b) => {
      const lat = b.projects.reduce((sum, p) => sum + (p.latitude as number), 0) / b.projects.length;
      const lng = b.projects.reduce((sum, p) => sum + (p.longitude as number), 0) / b.projects.length;
      return {
        kind: "developer",
        id: b.id,
        slug: b.slug,
        name: b.name,
        logoUrl: b.logoUrl,
        projectCount: b.projects.length,
        overallScore: b.scoreSnapshots[0] ? Number(b.scoreSnapshots[0].overallScore) : null,
        position: { lat, lng },
      };
    });
}
