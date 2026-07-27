import type { InfraType } from "@prisma/client";
import { distanceMeters } from "@/lib/geo";

const DUPLICATE_RADIUS_METERS = 150;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard overlap of word sets — cheap, dependency-free, good enough to flag "probably the same place". */
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  if (normalizeName(a) === normalizeName(b)) return 1;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export interface DuplicateMatch {
  existingId: string;
  confidence: number;
}

export interface ExistingInfraCandidate {
  id: string;
  type: InfraType;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Flags a likely-duplicate existing InfraAsset for a newly-fetched candidate —
 * same type, within DUPLICATE_RADIUS_METERS, with a similar-enough name. Pure
 * in-memory matching against a pre-fetched list (no DB call here) — the batch
 * runner loads every un-sourced InfraAsset for the city ONCE, not once per
 * candidate, since a per-candidate query would be far too many round trips
 * for a citywide sync over the HTTP adapter.
 */
export function findPossibleDuplicateInfraAsset(
  existingCandidates: ExistingInfraCandidate[],
  type: InfraType,
  name: string,
  latitude: number,
  longitude: number
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const candidate of existingCandidates) {
    if (candidate.type !== type) continue;
    const distance = distanceMeters(latitude, longitude, candidate.latitude, candidate.longitude);
    if (distance > DUPLICATE_RADIUS_METERS) continue;
    const similarity = nameSimilarity(name, candidate.name);
    if (similarity < 0.34) continue; // require at least one meaningfully shared word
    const confidence = Math.min(1, similarity * (1 - distance / DUPLICATE_RADIUS_METERS / 2));
    if (!best || confidence > best.confidence) best = { existingId: candidate.id, confidence };
  }
  return best;
}
