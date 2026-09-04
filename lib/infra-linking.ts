import "server-only";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { getLocalityNearbyInfra } from "@/lib/admin-queries";

/**
 * Reusable proximity service — computes which InfraAsset rows (schools,
 * hospitals, metro/rail stations, malls…) are near a given point. Used by
 * Locality's own live-computed nearby infra (lib/admin-queries.ts's
 * getLocalityNearbyInfra). Phase 67 removed Project.latitude/longitude
 * entirely, so the auto-linking counterpart that used to populate
 * Project.infraLinks (ProjectInfra) from a project's own coordinates
 * (`syncProjectNearbyInfra`) was removed with it — it had never fired for any
 * real project (none has ever had coordinates). The manual "Nearby places"
 * admin form (lib/actions/project-infra.ts) remains the only way to populate
 * ProjectInfra for a project.
 */

const DEFAULT_RADIUS_METERS = 3000;
const MAX_CANDIDATES = 20;
// ~4.8 km/h average walking pace — a standard planning estimate, not a
// measured value. Used only to derive a walk-time label from a real
// computed distance, same convention as any other derived metric in this
// codebase (see ProjectMetric / BuilderScoreSnapshot: dataSource AI_GENERATED
// = "computed value", never "fabricated fact").
const WALK_METERS_PER_MINUTE = 80;

export interface NearbyInfraCandidate {
  infraId: string;
  distanceMeters: number;
  walkMinutes: number;
}

/** Pure — no DB writes. Reusable by any entity with a lat/lng in a given city. */
export async function findNearbyInfraCandidates(
  cityId: string,
  latitude: number,
  longitude: number,
  radiusMeters = DEFAULT_RADIUS_METERS
): Promise<NearbyInfraCandidate[]> {
  const assets = await prisma.infraAsset.findMany({
    where: { cityId, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, latitude: true, longitude: true },
  });

  return assets
    .map((a) => ({
      infraId: a.id,
      distanceMeters: Math.round(distanceMeters(latitude, longitude, a.latitude as number, a.longitude as number)),
    }))
    .filter((c) => c.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({ ...c, walkMinutes: Math.max(1, Math.round(c.distanceMeters / WALK_METERS_PER_MINUTE)) }));
}

export interface TransactionNearbyInfraItem {
  id: string;
  name: string;
  type: string;
  distanceMeters: number;
}

/**
 * Reusable read service for Transaction — there's no TransactionInfra table
 * (a transaction has no lat/lng of its own), so this resolves via whichever
 * of the transaction's two real geo anchors is available: its linked
 * Project's own curated/computed links first, falling back to its
 * Locality's live-computed nearby infra (getLocalityNearbyInfra, existing).
 */
export async function getNearbyInfraForTransaction(transactionId: string): Promise<TransactionNearbyInfraItem[]> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { projectId: true, localityId: true },
  });
  if (!transaction) return [];

  if (transaction.projectId) {
    const links = await prisma.projectInfra.findMany({
      where: { projectId: transaction.projectId },
      include: { infra: { select: { id: true, name: true, type: true } } },
      orderBy: { distanceMeters: "asc" },
    });
    if (links.length > 0) {
      return links.map((l) => ({ id: l.infra.id, name: l.infra.name, type: l.infra.type, distanceMeters: l.distanceMeters }));
    }
  }

  const nearby = await getLocalityNearbyInfra(transaction.localityId);
  return nearby.map((n) => ({ id: n.id, name: n.name, type: n.type, distanceMeters: n.distanceMeters }));
}
