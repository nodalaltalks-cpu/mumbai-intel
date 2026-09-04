import type { PrismaClient, Prisma } from "@prisma/client";
import { buildDiscoveryCandidate } from "../buildCandidate";
import type { ExistingLocalityWithAliases } from "../areaLocalityResolution";
import { resolveStoredAreaNameToLocality } from "./areaEvidenceSearch";
import { existingDiscoveryCandidatesAsExistingCandidates, pendingProjectStagingAsExistingCandidates } from "../includeCandidate";
import { DISCOVERY_ENTITY_TYPE, type ProjectDiscoveryCandidatePayload } from "../types";
import type { ExistingProjectCandidate } from "@/lib/ingestion/duplicateMatch";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { decideCandidateFate } from "./decideCandidateFate";
import type { DeveloperDiscoveryResult } from "./discoverDeveloperProjects";

/**
 * Phase 55 Part H/I/K — turns already-computed generic-discovery results
 * into real `ProjectDiscoveryCandidate` IngestStagingRecord rows, using the
 * EXISTING duplicate-protection machinery (buildDiscoveryCandidate /
 * classifyDiscoveryDuplicate) that lib/actions/discovery.ts's own
 * `stageDiscoveryBatch` already relies on — never a second queue, never a
 * new model.
 *
 * Deliberately NOT a Server Action itself (no "use server", no session/audit
 * calls) — a plain, reusable function so BOTH the real admin trigger
 * (lib/actions/discovery.ts, which wraps this with requireMutateSession +
 * logAudit) and a script (which authenticates a different way) can share the
 * exact same staging logic rather than duplicating it.
 *
 * ONE generalization over `stageDiscoveryBatch`'s existing single-locality
 * assumption: this run spans MANY localities (city-wide, Part A), so each
 * candidate resolves its OWN locality via decideCandidateFate/
 * resolveAreaToLocality, and — the one real gap this surfaced — every
 * EXISTING discovery-candidate row must also be re-resolved to ITS OWN real
 * locality (via the same resolveAreaToLocality reuse) before joining the
 * duplicate-detection pool, since a ProjectDiscoveryCandidatePayload never
 * itself stores a resolved localityId (only free-text areaName). A prior
 * candidate whose areaName doesn't cleanly resolve is simply left out of the
 * dedup pool for this run (documented limitation, never a guessed locality).
 */
export interface StageMumbaiDiscoveryParams {
  prisma: PrismaClient;
  cityId: string;
  batchLabel: string;
  sourceKey: string;
  triggeredByUserId: string;
  developerResults: DeveloperDiscoveryResult[];
}

export interface DeveloperStagingTally {
  staged: number;
  needsReview: number;
  rejectedDuplicate: number;
  excludedStatus: number;
  excludedNoName: number;
  excludedNoLocationText: number;
  excludedLocationUnresolved: number;
  /** Phase 63 — subset of what used to be lumped into excludedLocationUnresolved, now labeled distinctly. */
  excludedMmrLocation: number;
  ambiguousLocation: number;
}

function emptyTally(): DeveloperStagingTally {
  return {
    staged: 0,
    needsReview: 0,
    rejectedDuplicate: 0,
    excludedStatus: 0,
    excludedNoName: 0,
    excludedNoLocationText: 0,
    excludedLocationUnresolved: 0,
    excludedMmrLocation: 0,
    ambiguousLocation: 0,
  };
}

export interface StageMumbaiDiscoveryOutcome {
  batchId: string;
  totals: DeveloperStagingTally;
  perDeveloper: Record<string, DeveloperStagingTally>;
  ambiguousLocationSamples: { developerName: string; projectName: string; areaText: string; candidateLocalityNames: string[] }[];
}

export async function stageMumbaiDiscoveryCandidates(params: StageMumbaiDiscoveryParams): Promise<StageMumbaiDiscoveryOutcome> {
  const { prisma } = params;

  const localityRows = await prisma.locality.findMany({
    where: { cityId: params.cityId },
    select: { id: true, name: true, aliases: { select: { alias: true } } },
  });
  const localities: ExistingLocalityWithAliases[] = localityRows.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) }));

  const [liveProjects, pendingProjectStagingRaw, existingDiscoveryCandidatesRaw] = await Promise.all([
    prisma.project.findMany({ where: { cityId: params.cityId }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: "Project" }, select: { id: true, payload: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: DISCOVERY_ENTITY_TYPE }, select: { id: true, payload: true } }),
  ]);

  // The one real generalization over stageDiscoveryBatch's single-locality
  // assumption -- see this file's doc comment.
  const resolvedExistingDiscoveryCandidates: { id: string; payload: ProjectDiscoveryCandidatePayload }[] = [];
  for (const r of existingDiscoveryCandidatesRaw) {
    const payload = r.payload as unknown as ProjectDiscoveryCandidatePayload;
    const match = resolveStoredAreaNameToLocality(payload.areaName, localities);
    if (match.status === "SINGLE_MATCH") resolvedExistingDiscoveryCandidates.push({ id: r.id, payload });
  }
  const existingCandidates: ExistingProjectCandidate[] = [
    ...liveProjects,
    ...pendingProjectStagingAsExistingCandidates(pendingProjectStagingRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectImportPayload }))),
    ...resolvedExistingDiscoveryCandidates.flatMap((r) => {
      const match = resolveStoredAreaNameToLocality(r.payload.areaName, localities);
      return match.status === "SINGLE_MATCH" ? existingDiscoveryCandidatesAsExistingCandidates([{ id: r.id, payload: r.payload }], match.localityId!) : [];
    }),
  ];

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey: params.sourceKey, trigger: "manual", triggeredByUserId: params.triggeredByUserId, status: "running" },
  });

  const totals = emptyTally();
  const perDeveloper: Record<string, DeveloperStagingTally> = {};
  const ambiguousLocationSamples: StageMumbaiDiscoveryOutcome["ambiguousLocationSamples"] = [];

  for (const devResult of params.developerResults) {
    const tally = (perDeveloper[devResult.developerName] ??= emptyTally());

    for (const candidate of devResult.candidates) {
      const fate = decideCandidateFate(devResult.developerName, devResult.domain, candidate, localities);

      if (fate.decision === "EXCLUDED_NO_NAME") {
        tally.excludedNoName += 1;
        totals.excludedNoName += 1;
        continue;
      }
      if (fate.decision === "EXCLUDED_STATUS") {
        tally.excludedStatus += 1;
        totals.excludedStatus += 1;
        continue;
      }
      if (fate.decision === "EXCLUDED_NO_LOCATION_TEXT") {
        tally.excludedNoLocationText += 1;
        totals.excludedNoLocationText += 1;
        continue;
      }
      if (fate.decision === "EXCLUDED_LOCATION_UNRESOLVED") {
        tally.excludedLocationUnresolved += 1;
        totals.excludedLocationUnresolved += 1;
        continue;
      }
      if (fate.decision === "EXCLUDED_MMR_LOCATION") {
        tally.excludedMmrLocation += 1;
        totals.excludedMmrLocation += 1;
        continue;
      }
      if (fate.decision === "AMBIGUOUS_LOCATION") {
        tally.ambiguousLocation += 1;
        totals.ambiguousLocation += 1;
        ambiguousLocationSamples.push({
          developerName: devResult.developerName,
          projectName: candidate.projectNameGuess ?? "(unknown)",
          areaText: candidate.areaEvidence[0]?.text ?? "",
          candidateLocalityNames: fate.candidateLocalityNames,
        });
        continue;
      }

      // STAGE
      const built = buildDiscoveryCandidate({ ...fate.input, localityId: fate.localityId, batchLabel: params.batchLabel }, existingCandidates);
      const created = await prisma.ingestStagingRecord.create({
        data: {
          batchId: batch.id,
          entityType: DISCOVERY_ENTITY_TYPE,
          status: built.status,
          payload: built.payload as unknown as Prisma.InputJsonValue,
          matchedExistingId: built.matchedExistingId,
          matchConfidence: built.matchConfidence,
        },
      });
      existingCandidates.push({ id: created.id, name: built.payload.projectName, localityId: fate.localityId, reraNumber: null });

      if (built.status === "REJECTED_DUPLICATE") {
        tally.rejectedDuplicate += 1;
        totals.rejectedDuplicate += 1;
      } else if (built.status === "NEEDS_REVIEW") {
        tally.needsReview += 1;
        totals.needsReview += 1;
      } else {
        tally.staged += 1;
        totals.staged += 1;
      }
    }
  }

  await prisma.ingestBatch.update({
    where: { id: batch.id },
    data: {
      status: "success",
      finishedAt: new Date(),
      recordsWritten: 0,
      recordsSkipped:
        totals.excludedNoName + totals.excludedStatus + totals.excludedNoLocationText + totals.excludedLocationUnresolved + totals.excludedMmrLocation + totals.ambiguousLocation,
      recordsFailed: 0,
    },
  });

  return { batchId: batch.id, totals, perDeveloper, ambiguousLocationSamples };
}
