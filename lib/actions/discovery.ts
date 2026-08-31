"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import type { ExistingProjectCandidate } from "@/lib/ingestion/duplicateMatch";
import { buildDiscoveryCandidate, type DiscoveryCandidateInput } from "@/lib/ingestion/discovery/buildCandidate";
import { applyFounderDiscoveryAction, type DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import { DISCOVERY_ENTITY_TYPE, type DiscoveryStatus } from "@/lib/ingestion/discovery/types";
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

/**
 * Part I — the founder's one decision per candidate (Include / Exclude /
 * Review). Never touches the Project table; only relabels this one staging
 * row's `status`. Gated by applyFounderDiscoveryAction's own transition rule
 * (a REJECTED_DUPLICATE candidate can't be Included without resolving the
 * duplicate first).
 */
export async function applyDiscoveryFounderAction(id: string, action: DiscoveryFounderAction): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMutateSession();
  const record = await loadDiscoveryCandidate(id);
  if (!record) return { ok: false, error: "Discovery candidate not found." };

  const result = applyFounderDiscoveryAction(record.status as DiscoveryStatus, action);
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.ingestStagingRecord.update({
    where: { id },
    data: { status: result.next, reviewedByUserId: session.userId, reviewedAt: new Date() },
  });
  await logAudit(session.userId, `discovery.candidate.${action.toLowerCase()}`, DISCOVERY_ENTITY_TYPE, id, {
    before: { status: record.status },
    after: { status: result.next },
  });
  return { ok: true };
}
