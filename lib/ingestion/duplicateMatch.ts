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

export interface ExistingProjectCandidate {
  id: string;
  name: string;
  localityId: string;
  reraNumber: string | null;
}

export interface ProjectDuplicateMatch extends DuplicateMatch {
  reason: "rera_number" | "name_locality";
}

/**
 * Flags a likely-duplicate existing Project for an imported candidate.
 * An exact RERA number match (a real, unique regulatory identifier) is
 * decisive on its own — no locality or name comparison needed. Otherwise
 * falls back to name similarity, restricted to the SAME locality (a
 * same-named project in a different area is not a duplicate) with a
 * stricter threshold than infra points, since project names are more
 * distinctive than "Andheri" appearing on ten different signboards.
 */
export function findPossibleDuplicateProject(
  existingProjects: ExistingProjectCandidate[],
  candidate: { name: string; localityId: string; reraNumber?: string }
): ProjectDuplicateMatch | null {
  if (candidate.reraNumber) {
    const exact = existingProjects.find(
      (p) => p.reraNumber && p.reraNumber.trim().toUpperCase() === candidate.reraNumber!.trim().toUpperCase()
    );
    if (exact) return { existingId: exact.id, confidence: 1, reason: "rera_number" };
  }

  let best: ProjectDuplicateMatch | null = null;
  for (const existing of existingProjects) {
    if (existing.localityId !== candidate.localityId) continue;
    const similarity = nameSimilarity(candidate.name, existing.name);
    if (similarity < 0.5) continue;
    if (!best || similarity > best.confidence) best = { existingId: existing.id, confidence: similarity, reason: "name_locality" };
  }
  return best;
}

export interface ExistingBuilderCandidate {
  id: string;
  name: string;
  reraNumber: string | null;
}

/**
 * Flags a likely-duplicate existing Builder. An exact RERA number match is
 * decisive. Otherwise falls back to name similarity — no locality
 * partitioning (builders aren't locality-scoped), with a high threshold
 * since builder names are highly distinctive ("Lodha Group", "Godrej
 * Properties") and a false-positive merge here is worse than a missed one.
 */
export function findPossibleDuplicateBuilder(
  existingBuilders: ExistingBuilderCandidate[],
  candidate: { name: string; reraNumber?: string }
): DuplicateMatch | null {
  if (candidate.reraNumber) {
    const exact = existingBuilders.find(
      (b) => b.reraNumber && b.reraNumber.trim().toUpperCase() === candidate.reraNumber!.trim().toUpperCase()
    );
    if (exact) return { existingId: exact.id, confidence: 1 };
  }

  let best: DuplicateMatch | null = null;
  for (const existing of existingBuilders) {
    const similarity = nameSimilarity(candidate.name, existing.name);
    if (similarity < 0.6) continue;
    if (!best || similarity > best.confidence) best = { existingId: existing.id, confidence: similarity };
  }
  return best;
}

export interface NamedDuplicateMatch extends DuplicateMatch {
  name: string;
}

/**
 * Same fuzzy matcher as findPossibleDuplicateBuilder, but returns EVERY
 * candidate above the threshold instead of collapsing to the single best one
 * -- used by Phase 33's Builder-resolution UI to detect genuine ambiguity
 * (e.g. an enrichment-discovered "Adani Realty" fuzzy-matching both an
 * "Adani Realty" row and an "Adani Realty & RC Group" row) so a human picks,
 * rather than silently taking the top score.
 */
export function findAllPossibleBuilderMatches(
  existingBuilders: ExistingBuilderCandidate[],
  candidateName: string,
  threshold = 0.6
): NamedDuplicateMatch[] {
  return existingBuilders
    .map((b) => ({ existingId: b.id, name: b.name, confidence: nameSimilarity(candidateName, b.name) }))
    .filter((m) => m.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
}

export interface ExistingTransactionStagingCandidate {
  id: string;
  sourceRef: string | null;
}

export interface TransactionDuplicateMatch extends DuplicateMatch {
  reason: "registration_number";
}

/**
 * Flags a likely-duplicate Transaction candidate already sitting PENDING in
 * the Transaction Review Queue (Phase 19) -- deliberately narrower than every
 * other findPossibleDuplicate* above: it only ever fires on an exact match of
 * a REAL external registration/document number, never on the synthetic
 * content-hash transactionFileImportRunner.ts falls back to when a source
 * doesn't supply one. A hash collision there already means byte-identical
 * content (handled separately, silently, as a true re-upload), so this
 * function's only job is the genuinely ambiguous case: the same real-world
 * document number appearing twice, which a human should look at rather than
 * either silently merge or silently duplicate.
 */
export function findPossibleDuplicateTransaction(
  pendingCandidates: ExistingTransactionStagingCandidate[],
  candidate: { registrationNumber?: string }
): TransactionDuplicateMatch | null {
  if (!candidate.registrationNumber) return null;
  const target = candidate.registrationNumber.trim().toUpperCase();
  const exact = pendingCandidates.find((c) => c.sourceRef && c.sourceRef.trim().toUpperCase() === target);
  return exact ? { existingId: exact.id, confidence: 1, reason: "registration_number" } : null;
}

export interface ExistingLocalityCandidate {
  id: string;
  name: string;
}

/** Flags a likely-duplicate existing Locality by name similarity within the same city (callers pre-filter to one city). */
export function findPossibleDuplicateLocality(
  existingLocalities: ExistingLocalityCandidate[],
  candidateName: string
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const existing of existingLocalities) {
    const similarity = nameSimilarity(candidateName, existing.name);
    if (similarity < 0.6) continue;
    if (!best || similarity > best.confidence) best = { existingId: existing.id, confidence: similarity };
  }
  return best;
}

/** Same fuzzy matcher as findPossibleDuplicateLocality, but returns EVERY candidate above the threshold instead of collapsing to the single best one -- see findAllPossibleBuilderMatches's doc comment for why. */
export function findAllPossibleLocalityMatches(
  existingLocalities: ExistingLocalityCandidate[],
  candidateName: string,
  threshold = 0.6
): NamedDuplicateMatch[] {
  return existingLocalities
    .map((l) => ({ existingId: l.id, name: l.name, confidence: nameSimilarity(candidateName, l.name) }))
    .filter((m) => m.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
}
