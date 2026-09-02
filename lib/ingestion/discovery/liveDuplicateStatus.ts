import type { PrismaClient } from "@prisma/client";
import type { ExistingProjectCandidate } from "../duplicateMatch";
import type { ProjectImportPayload } from "../connectors/fileImport/types";
import { resolveAreaToLocality, type ExistingLocalityWithAliases } from "./areaLocalityResolution";
import { classifyDiscoveryDuplicate, type DiscoveryDuplicateResult } from "./classifyDuplicate";
import { pendingProjectStagingAsExistingCandidates } from "./includeCandidate";
import type { ProjectDiscoveryCandidatePayload } from "./types";

/**
 * Phase 58 — a candidate's stored `payload.duplicateStatus` is a SNAPSHOT
 * taken once, at whatever moment it was originally staged (buildCandidate.ts).
 * A matching Project can be created afterwards (a normal import, or another
 * candidate getting Included) without that snapshot ever being revisited —
 * exactly the "Godrej Skyshore" confusion this phase fixes: the badge said
 * NO_MATCH, but Include's own fresh check (applyDiscoveryFounderAction,
 * lib/actions/discovery.ts) correctly found a CLEAR_ALIAS match and refused.
 *
 * This runs the EXACT SAME classifyDiscoveryDuplicate authority Include
 * already uses, just for DISPLAY, so the founder never sees a green "no
 * duplicate" badge on a row Include would actually refuse — and, just as
 * important, never sees a false "New" on a row that would actually route to
 * NEEDS_REVIEW because it duplicates ANOTHER open Discovery Queue candidate
 * (the real "Rustomjee 9 JVPD" vs. "Rustomjee 7 JVPD" case: two candidates,
 * not a Project). No new matching logic — this only re-runs the existing one
 * live, against the exact three sources Include's own check
 * (applyDiscoveryFounderAction, lib/actions/discovery.ts) uses, instead of
 * trusting a stale snapshot.
 */
export function resolveLiveDuplicateStatus(
  candidate: Pick<ProjectDiscoveryCandidatePayload, "projectName" | "areaName">,
  localities: ExistingLocalityWithAliases[],
  existingProjects: ExistingProjectCandidate[]
): DiscoveryDuplicateResult | null {
  const localityMatch = resolveAreaToLocality(candidate.areaName, localities);
  if (localityMatch.status !== "SINGLE_MATCH") return null;
  return classifyDiscoveryDuplicate(existingProjects, { name: candidate.projectName, localityId: localityMatch.localityId! });
}

/**
 * Fetches all three existing-candidate sources Include's own live check uses
 * (live Projects, still-pending Project-entityType staging rows, and every
 * OTHER open Discovery Queue candidate) and re-runs resolveLiveDuplicateStatus
 * for each given candidate. Each OTHER candidate is checked against ITS OWN
 * resolved locality (never one shared locality broadcast across all of
 * them — the existing includeCandidate.ts helper for this shape assumes a
 * single-locality batch, which doesn't fit a page rendering the whole queue).
 * Returns a Map keyed by candidate id; a candidate whose areaName doesn't
 * resolve to exactly one Locality is simply absent from the result (caller
 * falls back to the stored snapshot rather than guess a locality here).
 */
export async function computeLiveDuplicateStatuses(
  prisma: PrismaClient,
  cityId: string,
  candidates: { id: string; payload: ProjectDiscoveryCandidatePayload }[]
): Promise<Map<string, DiscoveryDuplicateResult>> {
  const result = new Map<string, DiscoveryDuplicateResult>();
  if (candidates.length === 0) return result;

  const [localityRows, liveProjects, pendingProjectStagingRaw] = await Promise.all([
    prisma.locality.findMany({ where: { cityId }, select: { id: true, name: true, aliases: { select: { alias: true } } } }),
    prisma.project.findMany({ where: { cityId }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: "Project" }, select: { id: true, payload: true } }),
  ]);
  const localities: ExistingLocalityWithAliases[] = localityRows.map((l) => ({
    id: l.id,
    name: l.name,
    aliases: l.aliases.map((a) => a.alias),
  }));
  const baseExistingProjects: ExistingProjectCandidate[] = [
    ...liveProjects,
    ...pendingProjectStagingAsExistingCandidates(
      pendingProjectStagingRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectImportPayload }))
    ),
  ];

  const localityIdByCandidateId = new Map<string, string>();
  for (const candidate of candidates) {
    const match = resolveAreaToLocality(candidate.payload.areaName, localities);
    if (match.status === "SINGLE_MATCH") localityIdByCandidateId.set(candidate.id, match.localityId!);
  }

  for (const candidate of candidates) {
    const otherCandidatesAsExisting: ExistingProjectCandidate[] = [];
    for (const other of candidates) {
      if (other.id === candidate.id) continue;
      const otherLocalityId = localityIdByCandidateId.get(other.id);
      if (!otherLocalityId) continue;
      otherCandidatesAsExisting.push({ id: other.id, name: other.payload.projectName, localityId: otherLocalityId, reraNumber: null });
    }

    const dup = resolveLiveDuplicateStatus(candidate.payload, localities, [...baseExistingProjects, ...otherCandidatesAsExisting]);
    if (dup) result.set(candidate.id, dup);
  }
  return result;
}
