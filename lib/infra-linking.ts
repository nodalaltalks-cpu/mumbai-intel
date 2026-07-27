import "server-only";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { getLocalityNearbyInfra } from "@/lib/admin-queries";

/**
 * Reusable proximity service — computes which InfraAsset rows (schools,
 * hospitals, metro/rail stations, malls…) are near a given point, and keeps
 * Project.infraLinks (ProjectInfra) populated automatically as new projects
 * are saved or new infra gets synced in. This is the automatic counterpart
 * to the existing manual "Nearby places" admin form (lib/actions/project-infra.ts) —
 * both write to the same ProjectInfra table; this one just never touches a
 * row an admin entered by hand.
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

/**
 * Populates/refreshes a project's ProjectInfra links from its own lat/lng.
 * Best-effort and idempotent: safe to call on every save, and safe to re-run
 * after a new OSM sync brings in infra that didn't exist yet. Never touches
 * a link an admin entered manually (dataSource !== "AI_GENERATED") — only
 * creates new AI_GENERATED links or refreshes ones this same service made.
 */
export async function syncProjectNearbyInfra(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { cityId: true, latitude: true, longitude: true },
    });
    if (!project || project.latitude === null || project.longitude === null) return;

    const candidates = await findNearbyInfraCandidates(project.cityId, project.latitude, project.longitude);

    const existingLinks = await prisma.projectInfra.findMany({
      where: { projectId },
      select: { id: true, infraId: true, dataSource: true },
    });
    const existingByInfraId = new Map(existingLinks.map((l) => [l.infraId, l]));

    for (const candidate of candidates) {
      const existing = existingByInfraId.get(candidate.infraId);
      if (existing && existing.dataSource !== "AI_GENERATED") continue; // admin-curated — never overwrite

      if (existing) {
        await prisma.projectInfra.update({
          where: { id: existing.id },
          data: { distanceMeters: candidate.distanceMeters, walkMinutes: candidate.walkMinutes },
        });
      } else {
        await prisma.projectInfra.create({
          data: {
            projectId,
            infraId: candidate.infraId,
            distanceMeters: candidate.distanceMeters,
            walkMinutes: candidate.walkMinutes,
            dataSource: "AI_GENERATED",
          },
        });
      }
    }
  } catch (error) {
    // A proximity refresh failing must never fail the project save it's attached to.
    console.error("[infra-linking] syncProjectNearbyInfra failed for", projectId, error);
  }
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
