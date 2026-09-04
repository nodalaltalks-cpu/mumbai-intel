import { prisma } from "@/lib/prisma";
import { TransactionAnalyticsService } from "@/lib/analytics";
import type { InfraMapMarker, LocalityMapMarker } from "@/lib/map/types";
import { getPublicSession } from "@/lib/public-auth/session";
import { PRIMARY_CITY_SLUG } from "./shared";

/**
 * Map-only queries — fetch the full published/geolocated dataset once (no
 * pagination, no filter params): the Map page filters/searches entirely
 * client-side against this dataset for instant, network-free interaction.
 * Every derived figure (price/sqft, config summary, median price) is
 * delegated to the Analytics Engine, same rule as the rest of the query layer.
 *
 * Guest gating: price/sqft, median price, rental yield and builder score are
 * "premium" fields masked everywhere else in the app (ProjectCard,
 * LocalityCard, BuilderCard) — they must be nulled out here too, server-side,
 * before the marker ever reaches MapExplorer/MapCanvas (a "use client" tree),
 * same contract as lib/premium/mask.ts's maskProjectBrochure.
 *
 * Phase 67 removed Project.latitude/longitude entirely (never populated for
 * any real project; no replacement geo field was introduced) — the Project
 * and Developer map layers had no other position source (a developer's pin
 * was derived as the centroid of its own projects' coordinates), so both
 * getProjectMapMarkers/getDeveloperMapMarkers and their marker kinds were
 * removed with it, per the founder's explicit call rather than leaving dead
 * UI/queries behind. Locality and Infra markers are unaffected — they use
 * their own stored geo fields (Locality.centroidLat/Lng, InfraAsset.lat/lng).
 */

export async function getLocalityMapMarkers(): Promise<LocalityMapMarker[]> {
  const session = await getPublicSession();
  const locked = session === null;
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
    where: { localityId: { in: localities.map((l) => l.id) }, deletedAt: null },
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
      medianPricePaise: locked ? null : TransactionAnalyticsService.calculateMedianPrice(localityTx),
      avgPricePerSqftPaise: locked ? null : l.avgPricePerSqftPaise !== null ? Number(l.avgPricePerSqftPaise) : null,
      rentalYieldPercent: locked ? null : l.rentalYieldPercent !== null ? Number(l.rentalYieldPercent) : null,
      transactionCount: localityTx.length,
      projectCount: l._count.projects,
      position: { lat: l.centroidLat as number, lng: l.centroidLng as number },
      boundary: null,
      locked,
    };
  });
}

/** Not editorial content (no isPublished flag on InfraAsset — it's reference infrastructure, not curated catalog). */
export async function getInfraMapMarkers(): Promise<InfraMapMarker[]> {
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) return [];

  const assets = await prisma.infraAsset.findMany({
    where: { cityId: city.id, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, type: true, detail: true, dataSource: true, latitude: true, longitude: true },
  });

  return assets.map((a) => ({
    kind: "infra",
    id: a.id,
    name: a.name,
    type: a.type,
    detail: a.detail,
    dataSource: a.dataSource,
    position: { lat: a.latitude as number, lng: a.longitude as number },
  }));
}
