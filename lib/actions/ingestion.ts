"use server";

import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { runIngestBatch } from "@/lib/ingestion/runner";
import { logAudit } from "@/lib/audit";
import { revalidateInfra } from "@/lib/cache";
import { friendlyPrismaError } from "./errors";

export interface IngestActionResult {
  error?: string;
  summary?: { written: number; skipped: number; staged: number; failed: number };
}

interface InfraStagingPayload {
  type: "SCHOOL" | "HOSPITAL" | "METRO_STATION" | "RAILWAY_STATION" | "MALL" | "AIRPORT";
  name: string;
  latitude: number;
  longitude: number;
  sourceRef: string;
  detail?: string;
}

/** Triggers one connector's sync immediately. Same mutate bar as any other data-entry action. */
export async function triggerSyncAction(sourceKey: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  try {
    const summary = await runIngestBatch(sourceKey, "manual", session.userId);
    await logAudit(session.userId, "ingest.sync", "IngestSource", sourceKey);
    revalidateInfra();
    return { summary };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Approves a pending IngestStagingRecord — creates or merges, per the record's shape. */
export async function approveStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record) return { error: "Staging record not found" };
  if (record.status !== "PENDING") return { error: "This record has already been reviewed" };
  if (record.entityType !== "InfraAsset") return { error: `Unsupported entity type "${record.entityType}"` };

  const payload = record.payload as unknown as InfraStagingPayload;

  try {
    if (record.targetId) {
      // Likely duplicate of an existing manually-curated row: link the sourceRef so future
      // syncs recognize it, without touching the curated fields an admin already verified.
      await prisma.infraAsset.update({ where: { id: record.targetId }, data: { sourceRef: payload.sourceRef } });
    } else {
      const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
      if (!city) return { error: `Primary city "${PRIMARY_CITY_SLUG}" is not seeded` };
      await prisma.infraAsset.create({
        data: {
          cityId: city.id,
          type: payload.type,
          name: payload.name,
          latitude: payload.latitude,
          longitude: payload.longitude,
          detail: payload.detail ?? null,
          dataSource: "EXTERNAL_OPEN_DATA",
          sourceRef: payload.sourceRef,
          ingestBatchId: record.batchId,
        },
      });
    }

    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "APPROVED", reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await logAudit(session.userId, "ingest.approve", "IngestStagingRecord", id);
    revalidateInfra();
    return {};
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Rejects a pending IngestStagingRecord — no write to InfraAsset. */
export async function rejectStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record) return { error: "Staging record not found" };
  if (record.status !== "PENDING") return { error: "This record has already been reviewed" };

  await prisma.ingestStagingRecord.update({
    where: { id },
    data: { status: "REJECTED", reviewedByUserId: session.userId, reviewedAt: new Date() },
  });
  await logAudit(session.userId, "ingest.reject", "IngestStagingRecord", id);
  revalidateInfra();
  return {};
}

/** Enables/disables a connector for the scheduled cron sweep — system configuration, ADMIN only. */
export async function toggleIngestSourceEnabledAction(key: string, enabled: boolean): Promise<IngestActionResult> {
  const session = await requireAdminSession();

  try {
    await prisma.ingestSource.update({ where: { key }, data: { enabled } });
    await logAudit(session.userId, enabled ? "ingest.source.enable" : "ingest.source.disable", "IngestSource", key);
    revalidateInfra();
    return {};
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}
