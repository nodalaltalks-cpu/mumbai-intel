import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { findPossibleDuplicateInfraAsset, type ExistingInfraCandidate } from "./duplicateMatch";
import { fetchOsmLocalityInfra, OSM_LOCALITY_INFRA_SOURCE_KEY } from "./connectors/osmLocalityInfra";
import type { ConnectorRunSummary, NormalizedInfraCandidate } from "./types";

/** Every registered connector, keyed by IngestSource.key. Add new connectors here as they're built. */
const CONNECTORS: Record<string, () => Promise<NormalizedInfraCandidate[]>> = {
  [OSM_LOCALITY_INFRA_SOURCE_KEY]: fetchOsmLocalityInfra,
};

/**
 * The HTTP adapter this app runs on (see lib/prisma.ts) has no interactive
 * transactions, so every write here is a single-row `create` — there's no
 * `createMany` to batch them (it needs a transaction too, confirmed against
 * this adapter). A citywide OSM sync can easily return 1000+ elements, and
 * one-row-at-a-time writes at typical Neon HTTP latency would blow past any
 * serverless function's time budget. So: reads are batched (2 queries total,
 * not one per candidate), and writes are capped per run — anything past the
 * cap is simply left for the next scheduled run (idempotent via sourceRef,
 * so nothing is lost, just spread across a couple of days on first backfill).
 */
const MAX_WRITES_PER_RUN = 150;

async function logEntry(batchId: string, entityType: string, entityId: string | null, action: string, message: string | null) {
  try {
    await prisma.ingestLogEntry.create({ data: { batchId, entityType, entityId, action, message } });
  } catch (error) {
    console.error("[ingestion] failed to write log entry", error);
  }
}

/**
 * Runs one connector end-to-end: fetch → per-record idempotency/duplicate
 * check (in-memory, against batch-prefetched data) → create or stage → log.
 * One bad record never aborts the batch.
 */
export async function runIngestBatch(
  sourceKey: string,
  trigger: "manual" | "scheduled",
  triggeredByUserId?: string
): Promise<ConnectorRunSummary> {
  const connector = CONNECTORS[sourceKey];
  if (!connector) throw new Error(`No connector registered for source "${sourceKey}"`);

  // Single-flight per source — an admin manually syncing while the scheduled
  // run is still in flight would otherwise race on InfraAsset's sourceRef
  // unique constraint (each run separately decides a candidate is "new"
  // before either has written it).
  const alreadyRunning = await prisma.ingestBatch.findFirst({ where: { sourceKey, status: "running" }, select: { id: true } });
  if (alreadyRunning) throw new Error(`A sync for "${sourceKey}" is already running (batch ${alreadyRunning.id})`);

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey, trigger, triggeredByUserId: triggeredByUserId ?? null, status: "running" },
  });

  const summary: ConnectorRunSummary = { written: 0, skipped: 0, staged: 0, failed: 0 };
  let deferred = 0;

  try {
    const candidates = await connector();
    const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG } });
    if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

    // Batch reads — once per run, not once per candidate.
    const existingSourceRefs = await prisma.infraAsset.findMany({
      where: { sourceRef: { in: candidates.map((c) => c.sourceRef) } },
      select: { sourceRef: true },
    });
    const existingSourceRefSet = new Set(existingSourceRefs.map((r) => r.sourceRef));

    const unsourcedAssets: ExistingInfraCandidate[] = (
      await prisma.infraAsset.findMany({
        where: { cityId: city.id, sourceRef: null, latitude: { not: null }, longitude: { not: null } },
        select: { id: true, type: true, name: true, latitude: true, longitude: true },
      })
    ).map((a) => ({ id: a.id, type: a.type, name: a.name, latitude: a.latitude as number, longitude: a.longitude as number }));

    let writesUsed = 0;
    for (const candidate of candidates) {
      if (existingSourceRefSet.has(candidate.sourceRef)) {
        summary.skipped += 1;
        continue;
      }

      if (writesUsed >= MAX_WRITES_PER_RUN) {
        deferred += 1;
        continue;
      }

      try {
        const duplicate = findPossibleDuplicateInfraAsset(unsourcedAssets, candidate.type, candidate.name, candidate.latitude, candidate.longitude);
        if (duplicate) {
          await prisma.ingestStagingRecord.create({
            data: {
              batchId: batch.id,
              entityType: "InfraAsset",
              targetId: duplicate.existingId,
              payload: candidate as unknown as Prisma.InputJsonValue,
              matchedExistingId: duplicate.existingId,
              matchConfidence: duplicate.confidence,
            },
          });
          summary.staged += 1;
          writesUsed += 1;
          await logEntry(
            batch.id,
            "InfraAsset",
            duplicate.existingId,
            "STAGED",
            `Possible duplicate of an existing manually-curated record (confidence ${duplicate.confidence.toFixed(2)}) — awaiting review`
          );
          continue;
        }

        const created = await prisma.infraAsset.create({
          data: {
            cityId: city.id,
            type: candidate.type,
            name: candidate.name,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            detail: candidate.detail ?? null,
            dataSource: "EXTERNAL_OPEN_DATA",
            sourceRef: candidate.sourceRef,
            ingestBatchId: batch.id,
          },
        });
        summary.written += 1;
        writesUsed += 1;
        await logEntry(batch.id, "InfraAsset", created.id, "CREATED", null);
      } catch (error) {
        summary.failed += 1;
        writesUsed += 1;
        await logEntry(batch.id, "InfraAsset", null, "FAILED", error instanceof Error ? error.message : "Unknown error");
      }
    }

    if (summary.skipped > 0) {
      await logEntry(batch.id, "InfraAsset", null, "SKIPPED_DUPLICATE", `${summary.skipped} record(s) already ingested (sourceRef match)`);
    }
    if (deferred > 0) {
      await logEntry(
        batch.id,
        "InfraAsset",
        null,
        "SKIPPED_DUPLICATE",
        `${deferred} new record(s) found beyond this run's write cap (${MAX_WRITES_PER_RUN}) — will be picked up on the next scheduled sync`
      );
    }

    await prisma.ingestBatch.update({
      where: { id: batch.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        recordsWritten: summary.written,
        recordsSkipped: summary.skipped,
        recordsFailed: summary.failed,
      },
    });

    try {
      await prisma.ingestSource.update({ where: { key: sourceKey }, data: { lastRunAt: new Date() } });
    } catch {
      // IngestSource registry row is bookkeeping only — a missing row must never fail a batch that already succeeded.
    }
  } catch (error) {
    await prisma.ingestBatch.update({
      where: { id: batch.id },
      data: { status: "failed", finishedAt: new Date(), note: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }

  return summary;
}
