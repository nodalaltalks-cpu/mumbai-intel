"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { resolveBuilderMatch, resolveLocalityMatch } from "@/lib/enrichment/resolveNamedEntity";
import type { ExistingProjectCandidate } from "@/lib/ingestion/duplicateMatch";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { buildDiscoveryCandidate, type DiscoveryCandidateInput } from "@/lib/ingestion/discovery/buildCandidate";
import { classifyDiscoveryDuplicate } from "@/lib/ingestion/discovery/classifyDuplicate";
import { mapDiscoveryCandidateToProjectPayload, pendingProjectStagingAsExistingCandidates } from "@/lib/ingestion/discovery/includeCandidate";
import { applyFounderDiscoveryAction, type DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import { DISCOVERY_ENTITY_TYPE, type DiscoveryStatus, type ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";
import type { ConnectorRunSummary } from "@/lib/ingestion/types";

/**
 * Phase 39 Part H/K — stages a batch of discovery candidates for ONE already-
 * chosen area (a single existing Locality). Deliberately narrow: this is the
 * "prepare the data/control structure" step, not the future bulk-enrichment
 * runner — it writes ProjectDiscoveryCandidate staging rows (Part C), never a
 * real Project, and never approves/enriches anything. Reuses the exact same
 * IngestBatch + IngestStagingRecord write pattern every existing file-import
 * runner already uses (see lib/ingestion/fileImportRunner.ts), including its
 * "recordsWritten always 0 for a staging-only runner" convention.
 */
export type StageDiscoveryCandidateInput = Omit<DiscoveryCandidateInput, "localityId" | "batchLabel">;

export interface StageDiscoveryBatchParams {
  batchLabel: string;
  localityId: string;
  sourceKey: string;
  candidates: StageDiscoveryCandidateInput[];
}

export interface StageDiscoveryBatchResult extends ConnectorRunSummary {
  batchId: string;
}

export async function stageDiscoveryBatch(params: StageDiscoveryBatchParams): Promise<StageDiscoveryBatchResult> {
  const session = await requireMutateSession();

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

  const existingProjects: ExistingProjectCandidate[] = await prisma.project.findMany({
    where: { cityId: city.id },
    select: { id: true, name: true, localityId: true, reraNumber: true },
  });

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey: params.sourceKey, trigger: "manual", triggeredByUserId: session.userId, status: "running" },
  });

  const summary: ConnectorRunSummary = { written: 0, skipped: 0, staged: 0, failed: 0 };

  for (const candidateInput of params.candidates) {
    try {
      const built = buildDiscoveryCandidate({ ...candidateInput, localityId: params.localityId, batchLabel: params.batchLabel }, existingProjects);
      await prisma.ingestStagingRecord.create({
        data: {
          batchId: batch.id,
          entityType: DISCOVERY_ENTITY_TYPE,
          status: built.status,
          payload: built.payload as unknown as Prisma.InputJsonValue,
          matchedExistingId: built.matchedExistingId,
          matchConfidence: built.matchConfidence,
        },
      });
      summary.staged += 1;
    } catch {
      summary.failed += 1;
    }
  }

  await prisma.ingestBatch.update({
    where: { id: batch.id },
    data: { status: "success", finishedAt: new Date(), recordsWritten: summary.written, recordsSkipped: summary.skipped, recordsFailed: summary.failed },
  });

  await logAudit(session.userId, "discovery.batch.stage", "IngestBatch", batch.id, {
    after: { batchLabel: params.batchLabel, staged: summary.staged, failed: summary.failed },
  });

  return { ...summary, batchId: batch.id };
}

async function loadDiscoveryCandidate(id: string) {
  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record || record.entityType !== DISCOVERY_ENTITY_TYPE) return null;
  return record;
}

export interface DiscoveryFounderActionResult {
  ok: boolean;
  error?: string;
  /** Set only on a successful INCLUDE (Phase 40) — the id of the new `entityType: "Project"` IngestStagingRecord now sitting in the EXISTING Project Review Queue. */
  projectStagingRecordId?: string;
}

/**
 * Part I — the founder's one decision per candidate (Include / Exclude /
 * Review).
 *
 * Exclude/Review only ever relabel this one staging row's `status` — never
 * touch the Project table.
 *
 * Include (Phase 40 Part B/E) is the one action that can create a real
 * `entityType: "Project"` IngestStagingRecord, but ONLY after:
 *  1. applyFounderDiscoveryAction's pre-guard passes (not already
 *     REJECTED_DUPLICATE or PROJECT_STAGED);
 *  2. the candidate's `areaName` resolves to EXACTLY ONE existing Locality
 *     (Phase 33's resolveLocalityMatch, reused verbatim — never a guessed id);
 *  3. the EXISTING Project duplicate matcher (classifyDiscoveryDuplicate,
 *     itself a thin reuse of findPossibleDuplicateProject) finds NO_MATCH
 *     against BOTH the live Project table AND every still-PENDING
 *     "Project"-entityType staging record (Part E's own worked example: a
 *     discovery candidate can easily name a project that's already sitting
 *     in the Review Queue from an earlier import — findPossibleDuplicateProject
 *     alone only ever checked the live table, so this second list is Phase
 *     40's one small, precedented addition, mirroring
 *     transactionFileImportRunner.ts's identical dual-check for Transactions).
 * EXACT/CLEAR_ALIAS refuse and relabel the candidate REJECTED_DUPLICATE;
 * AMBIGUOUS refuses and relabels it NEEDS_REVIEW; only NO_MATCH proceeds.
 *
 * Never approves, rejects, or writes anything to the live Project table —
 * the new row is a normal PENDING Project staging candidate, exactly like
 * every other file-import row, waiting in the same Review Queue for a human
 * to Approve/Reject through the EXISTING, unmodified workflow.
 */
export async function applyDiscoveryFounderAction(id: string, action: DiscoveryFounderAction): Promise<DiscoveryFounderActionResult> {
  const session = await requireMutateSession();
  const record = await loadDiscoveryCandidate(id);
  if (!record) return { ok: false, error: "Discovery candidate not found." };

  const guard = applyFounderDiscoveryAction(record.status as DiscoveryStatus, action);
  if (!guard.ok) return { ok: false, error: guard.error };

  if (action !== "INCLUDE") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: guard.next, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await logAudit(session.userId, `discovery.candidate.${action.toLowerCase()}`, DISCOVERY_ENTITY_TYPE, id, {
      before: { status: record.status },
      after: { status: guard.next },
    });
    return { ok: true };
  }

  const candidatePayload = record.payload as unknown as ProjectDiscoveryCandidatePayload;

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) return { ok: false, error: `Primary city "${PRIMARY_CITY_SLUG}" is not seeded.` };

  const localities = await prisma.locality.findMany({
    where: { cityId: city.id },
    select: { id: true, name: true, aliases: { select: { alias: true } } },
  });
  const localityMatch = resolveLocalityMatch(
    localities.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) })),
    candidatePayload.areaName
  );
  if (localityMatch.status !== "SINGLE_MATCH" || localityMatch.candidates[0].confidence !== 1) {
    return {
      ok: false,
      error: `Could not confidently resolve area "${candidatePayload.areaName}" to exactly one existing locality (${localityMatch.status}). Resolve the locality manually before including this candidate.`,
    };
  }
  const resolvedLocalityId = localityMatch.candidates[0].id;

  const [liveProjects, pendingProjectStagingRaw] = await Promise.all([
    prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: "Project" }, select: { id: true, payload: true } }),
  ]);
  const combinedExisting: ExistingProjectCandidate[] = [
    ...liveProjects,
    ...pendingProjectStagingAsExistingCandidates(
      pendingProjectStagingRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectImportPayload }))
    ),
  ];

  const dup = classifyDiscoveryDuplicate(combinedExisting, { name: candidatePayload.projectName, localityId: resolvedLocalityId });

  if (dup.duplicateStatus === "AMBIGUOUS") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "NEEDS_REVIEW", matchedExistingId: dup.match?.existingId ?? null, matchConfidence: dup.match?.confidence ?? null, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    return { ok: false, error: `Ambiguous match against an existing project ("${dup.match?.existingName}") — needs founder review before staging.` };
  }
  if (dup.duplicateStatus === "EXACT" || dup.duplicateStatus === "CLEAR_ALIAS") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "REJECTED_DUPLICATE", matchedExistingId: dup.match?.existingId ?? null, matchConfidence: dup.match?.confidence ?? null, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    return {
      ok: false,
      error: `This project already exists ("${dup.match?.existingName}", ${dup.duplicateStatus}) — not staged again. See IngestStagingRecord ${dup.match?.existingId}.`,
    };
  }

  // NO_MATCH -- safe to resolve a builder (never guessed: only an exact,
  // confidence-1 match auto-fills builderId; anything fuzzier is left for
  // the founder/enrichment's own existing Builder-resolution UI) and create
  // the new Project staging record.
  const builders = await prisma.builder.findMany({ select: { id: true, name: true, legalNames: true, reraNumber: true } });
  const builderMatch = resolveBuilderMatch(builders, candidatePayload.developerName);
  const resolvedBuilderId = builderMatch.status === "SINGLE_MATCH" && builderMatch.candidates[0].confidence === 1 ? builderMatch.candidates[0].id : null;

  const projectPayload = mapDiscoveryCandidateToProjectPayload(candidatePayload, resolvedLocalityId, resolvedBuilderId, id);

  const projectStagingRecord = await prisma.ingestStagingRecord.create({
    data: {
      batchId: record.batchId,
      entityType: "Project",
      status: "PENDING",
      payload: projectPayload as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.ingestStagingRecord.update({
    where: { id },
    data: { status: "PROJECT_STAGED", reviewedByUserId: session.userId, reviewedAt: new Date() },
  });

  await logAudit(session.userId, "discovery.candidate.include", DISCOVERY_ENTITY_TYPE, id, {
    before: { status: record.status },
    after: { status: "PROJECT_STAGED", projectStagingRecordId: projectStagingRecord.id },
  });

  return { ok: true, projectStagingRecordId: projectStagingRecord.id };
}
