"use server";

import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { applyDiscoveryFounderAction } from "./discovery";
import { enrichProjectAction, type EnrichProjectStatus } from "./enrichment";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

/**
 * Phase 44 — the first controlled multi-project batch runner. Deliberately
 * NOT a new enrichment engine (Part D): every project is processed by
 * calling the two EXISTING, already-tested actions this codebase already
 * has -- `applyDiscoveryFounderAction(id, "INCLUDE")` (Phase 40) and
 * `enrichProjectAction` (Phase 29) -- in a plain sequential loop (Part F:
 * "determine whether sequential is fast enough" before reaching for any
 * concurrency). This file adds ZERO new classification, matching, or
 * source-resolution logic; it only orchestrates, times, and isolates
 * failures across MULTIPLE independent calls to those two actions.
 *
 * Never approves, accepts, or publishes anything -- both underlying actions
 * already guarantee that on their own (enrichProjectAction never writes;
 * applyDiscoveryFounderAction only ever creates a normal PENDING Project
 * staging row, exactly like a single-project Include). This runner adds no
 * new write path of its own.
 */
// Not exported -- every export of a "use server" file must itself be an
// async Server Action (the exact Phase 35 lesson: a plain non-function
// export broke the production build once already). Keep the cap as a
// private module constant; callers learn the limit from this function's
// own thrown error message, not by importing a number.
const BULK_ENRICHMENT_MAX_TARGETS = 10;

// Phase 45 Part B/J/M -- concurrency is capped at 3 on purpose. This phase's
// own instruction is "prove 2, then 3 are safe" before ever considering more;
// raising this number is a deliberate, future decision, never an accident.
const BULK_ENRICHMENT_MAX_CONCURRENCY = 3;

export interface BulkEnrichmentTarget {
  /** A ProjectDiscoveryCandidate not yet staged -- Include runs first, then enrichment. */
  discoveryCandidateId?: string;
  /** An already-staged Project record -- enrichment runs directly, no Include needed. */
  stagingRecordId?: string;
}

export type BulkEnrichmentProjectStatus = EnrichProjectStatus | "INCLUDE_FAILED";

export interface BulkEnrichmentProjectResult {
  discoveryCandidateId?: string;
  stagingRecordId?: string;
  projectName: string;
  developerGroup?: string;
  sourceUrl?: string;
  status: BulkEnrichmentProjectStatus;
  durationMs: number;
  fieldsFound: number;
  greenNew: number;
  confirmed: number;
  yellow: number;
  conflict: number;
  missing: number;
  errorCode?: string;
}

export interface BulkEnrichmentResult {
  totalDurationMs: number;
  results: BulkEnrichmentProjectResult[];
}

function emptyCounts() {
  return { greenNew: 0, confirmed: 0, yellow: 0, conflict: 0, missing: 0 };
}

/**
 * Resolves ONE target to a concrete Project stagingRecordId, running
 * Include first only when genuinely needed. Part G idempotency: if this
 * exact discovery candidate was already Included by an earlier run of the
 * SAME batch (status is already PROJECT_STAGED), this finds its existing
 * Project staging record by `sourceRef = "discovery:<candidateId>"` instead
 * of attempting -- and failing -- another Include. Re-reads live state every
 * time; never trusts anything the caller already believed.
 */
async function resolveStagingRecordId(target: BulkEnrichmentTarget): Promise<{ id: string } | { error: string }> {
  if (target.stagingRecordId) return { id: target.stagingRecordId };
  if (!target.discoveryCandidateId) return { error: "Target must specify either discoveryCandidateId or stagingRecordId." };

  const includeResult = await applyDiscoveryFounderAction(target.discoveryCandidateId, "INCLUDE");
  if (includeResult.ok && includeResult.projectStagingRecordId) {
    return { id: includeResult.projectStagingRecordId };
  }

  // Idempotent re-run: this candidate was already staged by an earlier call
  // (this same batch running twice, or an earlier Phase 40/42 Include) --
  // find its real Project staging record rather than reporting a false failure.
  const existingStaged = await prisma.ingestStagingRecord.findFirst({
    where: { entityType: "Project", payload: { path: ["sourceRef"], equals: `discovery:${target.discoveryCandidateId}` } },
    select: { id: true },
  });
  if (existingStaged) return { id: existingStaged.id };

  return { error: includeResult.error ?? "Include failed for an unknown reason." };
}

/**
 * Processes ONE target end-to-end (resolve staging record, re-read live
 * state, enrich) and NEVER throws -- every failure mode (Include refused,
 * staging record vanished, enrichment error) is captured into its own
 * result object instead. This is what makes Part C (failure isolation) hold
 * under concurrency: a pool of N of these running in parallel can never have
 * one target's rejection take down the others, because there is no
 * rejection to propagate.
 */
async function processTarget(target: BulkEnrichmentTarget): Promise<BulkEnrichmentProjectResult> {
  const projectStart = Date.now();
  let projectName = target.discoveryCandidateId ?? target.stagingRecordId ?? "unknown";

  try {
    const resolved = await resolveStagingRecordId(target);
    if ("error" in resolved) {
      return {
        discoveryCandidateId: target.discoveryCandidateId,
        stagingRecordId: target.stagingRecordId,
        projectName,
        status: "INCLUDE_FAILED",
        durationMs: Date.now() - projectStart,
        fieldsFound: 0,
        ...emptyCounts(),
        errorCode: resolved.error,
      };
    }
    const stagingRecordId = resolved.id;

    // Part G -- re-read the CURRENT staging state fresh right before
    // enriching, never relying on whatever the caller believed it to be.
    const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
    if (!record || record.entityType !== "Project") {
      return {
        discoveryCandidateId: target.discoveryCandidateId,
        stagingRecordId,
        projectName,
        status: "ERROR",
        durationMs: Date.now() - projectStart,
        fieldsFound: 0,
        ...emptyCounts(),
        errorCode: "Staging record not found or not a Project record at enrichment time.",
      };
    }
    const payload = record.payload as unknown as ProjectImportPayload;
    projectName = payload.name || projectName;

    const enrichResult = await enrichProjectAction(stagingRecordId);
    const counts = emptyCounts();
    for (const f of enrichResult.fields ?? []) {
      if (f.classification === "GREEN_NEW") counts.greenNew++;
      else if (f.classification === "CONFIRMED") counts.confirmed++;
      else if (f.classification === "YELLOW") counts.yellow++;
      else if (f.classification === "CONFLICT") counts.conflict++;
      else counts.missing++;
    }

    return {
      discoveryCandidateId: target.discoveryCandidateId,
      stagingRecordId,
      projectName,
      developerGroup: payload.developerGroup,
      sourceUrl: enrichResult.fields?.find((f) => f.sourceUrl)?.sourceUrl ?? undefined,
      status: enrichResult.status,
      durationMs: Date.now() - projectStart,
      fieldsFound: counts.greenNew + counts.confirmed + counts.yellow + counts.conflict,
      ...counts,
      errorCode: enrichResult.error,
    };
  } catch (error) {
    return {
      discoveryCandidateId: target.discoveryCandidateId,
      stagingRecordId: target.stagingRecordId,
      projectName,
      status: "ERROR",
      durationMs: Date.now() - projectStart,
      fieldsFound: 0,
      ...emptyCounts(),
      errorCode: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Phase 45 Part B -- the smallest possible concurrency-limited runner: a
 * fixed-size pool of workers that each pull the next unclaimed index and
 * write their result at that SAME index, so the returned array always
 * matches the input order regardless of which target finishes first (Part L
 * test 6). At `limit === 1` this is byte-for-byte equivalent to the old
 * plain sequential for-loop (one worker, claims index 0, 1, 2... in order,
 * never overlapping) -- so the existing default behavior is unchanged, not
 * reimplemented differently for the concurrency=1 case.
 */
async function runWithConcurrencyLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}

export interface RunBulkEnrichmentOptions {
  /** Phase 45 Part B/M -- 1 (default, sequential) through 3. Never higher this phase -- see BULK_ENRICHMENT_MAX_CONCURRENCY. */
  concurrency?: number;
}

/**
 * Runs enrichment across MULTIPLE independent targets (Part F: sequential by
 * default; Phase 45 adds optional controlled concurrency, still capped and
 * still failure-isolated per target -- Part E). Capped at
 * BULK_ENRICHMENT_MAX_TARGETS (Part O: max 10 per run).
 */
export async function runBulkEnrichment(targets: BulkEnrichmentTarget[], options?: RunBulkEnrichmentOptions): Promise<BulkEnrichmentResult> {
  await requireMutateSession();

  if (targets.length === 0) return { totalDurationMs: 0, results: [] };
  if (targets.length > BULK_ENRICHMENT_MAX_TARGETS) {
    throw new Error(`Bulk enrichment is capped at ${BULK_ENRICHMENT_MAX_TARGETS} projects per run (Phase 44 Part O) -- received ${targets.length}.`);
  }
  const concurrency = options?.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > BULK_ENRICHMENT_MAX_CONCURRENCY) {
    throw new Error(`Bulk enrichment concurrency must be an integer between 1 and ${BULK_ENRICHMENT_MAX_CONCURRENCY} (Phase 45 Part B/J/M) -- received ${concurrency}.`);
  }

  const batchStart = Date.now();
  const results = await runWithConcurrencyLimit(targets, concurrency, processTarget);
  return { totalDurationMs: Date.now() - batchStart, results };
}
