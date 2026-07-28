"use server";

import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { runIngestBatch } from "@/lib/ingestion/runner";
import { runProjectFileImport, type FileFormat } from "@/lib/ingestion/fileImportRunner";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { buildProjectData, type ProjectSchemaInput } from "@/lib/project-data";
import { ensureUniqueSlug } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { revalidateInfra } from "@/lib/cache";
import { emit } from "@/lib/events";
import { friendlyPrismaError } from "./errors";
import { DATA_SOURCES } from "@/lib/project-meta";
import type { DataSource } from "@prisma/client";

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

/** Triggers one API-based connector's sync immediately. Same mutate bar as any other data-entry action. */
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

/** Uploads and stages a CSV/JSON Project file — nothing is written to Project directly; every row lands in the Review Queue. */
export async function importProjectsFileAction(_prevState: IngestActionResult, formData: FormData): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or JSON file to upload" };

  const dataSourceRaw = formData.get("dataSource");
  const dataSource = DATA_SOURCES.find((d) => d === dataSourceRaw) as DataSource | undefined;
  if (!dataSource) return { error: "Choose the source of this file (builder, official, etc.)" };

  const fileFormat: FileFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";

  try {
    const fileText = await file.text();
    const summary = await runProjectFileImport({
      sourceKey: "csv-upload-projects",
      fileText,
      fileFormat,
      dataSource,
      triggeredByUserId: session.userId,
    });
    await logAudit(session.userId, "ingest.file-import", "IngestSource", "csv-upload-projects");
    revalidateInfra();
    return { summary };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

async function applyInfraAssetApproval(record: { targetId: string | null; payload: unknown; batchId: string }): Promise<string> {
  const payload = record.payload as unknown as InfraStagingPayload;
  if (record.targetId) {
    // Likely duplicate of an existing manually-curated row: link the sourceRef so future
    // syncs recognize it, without touching the curated fields an admin already verified.
    await prisma.infraAsset.update({ where: { id: record.targetId }, data: { sourceRef: payload.sourceRef } });
    return record.targetId;
  }
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);
  const created = await prisma.infraAsset.create({
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
    select: { id: true },
  });
  return created.id;
}

/** Builds the exact shape buildProjectData() (lib/actions/projects.ts) expects, from a stored ProjectImportPayload. */
function toProjectSchemaInput(payload: ProjectImportPayload): ProjectSchemaInput {
  return {
    name: payload.name,
    slug: undefined,
    tagline: undefined,
    description: payload.description,
    builderId: payload.builderId,
    developerGroup: payload.developerGroup,
    localityId: payload.localityId,
    microMarketId: undefined,
    highlights: undefined,
    status: payload.status,
    category: payload.category,
    address: payload.address,
    latitude: payload.latitude,
    longitude: payload.longitude,
    launchDate: payload.launchDateIso ? new Date(payload.launchDateIso) : undefined,
    promisedPossession: payload.possessionDateIso ? new Date(payload.possessionDateIso) : undefined,
    actualPossession: undefined,
    constructionPercent: undefined,
    reraNumber: payload.reraNumber,
    reraStatus: payload.reraStatus,
    totalUnits: payload.totalUnits,
    totalTowers: payload.totalTowers,
    landAreaAcres: undefined,
    priceMinRupees: payload.priceMinRupees,
    priceMaxRupees: payload.priceMaxRupees,
    dataSource: payload.dataSource,
    confidence: "MEDIUM",
    sourceRef: payload.sourceRef,
    videoUrl: undefined,
    tour360Url: undefined,
    // Always false, even on approval — publishing an imported record is a separate,
    // deliberate admin action, not something "approve" implies on its own.
    isPublished: false,
    isFeatured: false,
    isTrending: false,
    isLuxury: false,
    isAffordable: false,
    metaTitle: undefined,
    metaDescription: undefined,
    ogImageUrl: undefined,
  };
}

async function applyProjectApproval(record: { targetId: string | null; payload: unknown }): Promise<string> {
  const payload = record.payload as unknown as ProjectImportPayload;
  const schemaInput = toProjectSchemaInput(payload);

  if (record.targetId) {
    await prisma.project.update({ where: { id: record.targetId }, data: buildProjectData(schemaInput) });
    return record.targetId;
  }
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);
  const slug = await ensureUniqueSlug(payload.name, async (candidate) => {
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });
  const created = await prisma.project.create({ data: { slug, cityId: city.id, ...buildProjectData(schemaInput) }, select: { id: true } });
  return created.id;
}

/** Approves a pending IngestStagingRecord — creates or merges, per the record's entityType. */
export async function approveStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record) return { error: "Staging record not found" };
  if (record.status !== "PENDING") return { error: "This record has already been reviewed" };

  try {
    let entityId: string;
    if (record.entityType === "InfraAsset") {
      entityId = await applyInfraAssetApproval(record);
    } else if (record.entityType === "Project") {
      entityId = await applyProjectApproval(record);
    } else {
      return { error: `Unsupported entity type "${record.entityType}"` };
    }

    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "APPROVED", reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await emit("ReviewApproved", { stagingRecordId: id, entityType: record.entityType, entityId, actorId: session.userId });
    return {};
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Rejects a pending IngestStagingRecord — no write to the target entity. */
export async function rejectStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record) return { error: "Staging record not found" };
  if (record.status !== "PENDING") return { error: "This record has already been reviewed" };

  await prisma.ingestStagingRecord.update({
    where: { id },
    data: { status: "REJECTED", reviewedByUserId: session.userId, reviewedAt: new Date() },
  });
  await emit("ReviewRejected", { stagingRecordId: id, entityType: record.entityType, actorId: session.userId });
  return {};
}

/** Bulk-approves pending staging records — loops the single-record approval so each row still gets its own audit entry. */
export async function bulkApproveStagingRecordsAction(ids: string[]): Promise<{ error?: string; approved?: number; failed?: number }> {
  if (ids.length === 0) return { error: "No records selected" };
  let approved = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await approveStagingRecordAction(id);
    if (result.error) failed += 1;
    else approved += 1;
  }
  return { approved, failed };
}

/** Bulk-rejects pending staging records — loops the single-record rejection so each row still gets its own audit entry. */
export async function bulkRejectStagingRecordsAction(ids: string[]): Promise<{ error?: string; rejected?: number; failed?: number }> {
  if (ids.length === 0) return { error: "No records selected" };
  let rejected = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await rejectStagingRecordAction(id);
    if (result.error) failed += 1;
    else rejected += 1;
  }
  return { rejected, failed };
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
