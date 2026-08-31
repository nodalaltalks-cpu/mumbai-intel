"use server";

import { requireAdminSession, requireMutateSession, isAdmin } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { runIngestBatch } from "@/lib/ingestion/runner";
import { runProjectFileImport, type FileFormat } from "@/lib/ingestion/fileImportRunner";
import { runBuilderFileImport } from "@/lib/ingestion/builderFileImportRunner";
import { runLocalityFileImport } from "@/lib/ingestion/localityFileImportRunner";
import { runTransactionFileImport } from "@/lib/ingestion/transactionFileImportRunner";
import type {
  BuilderImportPayload,
  LocalityImportPayload,
  ProjectImportPayload,
  TransactionImportPayload,
} from "@/lib/ingestion/connectors/fileImport/types";
import { buildProjectData, toProjectSchemaInput } from "@/lib/project-data";
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

/** Uploads and stages a CSV/JSON Builder file — the Builder counterpart to importProjectsFileAction. */
export async function importBuildersFileAction(_prevState: IngestActionResult, formData: FormData): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or JSON file to upload" };

  const dataSourceRaw = formData.get("dataSource");
  const dataSource = DATA_SOURCES.find((d) => d === dataSourceRaw) as DataSource | undefined;
  if (!dataSource) return { error: "Choose the source of this file (builder, official, etc.)" };

  const fileFormat: FileFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";

  try {
    const fileText = await file.text();
    const summary = await runBuilderFileImport({
      sourceKey: "csv-upload-builders",
      fileText,
      fileFormat,
      dataSource,
      triggeredByUserId: session.userId,
    });
    await logAudit(session.userId, "ingest.file-import", "IngestSource", "csv-upload-builders");
    return { summary };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Uploads and stages a CSV/JSON Locality file — the Locality counterpart to importProjectsFileAction. */
export async function importLocalitiesFileAction(_prevState: IngestActionResult, formData: FormData): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or JSON file to upload" };

  const dataSourceRaw = formData.get("dataSource");
  const dataSource = DATA_SOURCES.find((d) => d === dataSourceRaw) as DataSource | undefined;
  if (!dataSource) return { error: "Choose the source of this file (builder, official, etc.)" };

  const fileFormat: FileFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";

  try {
    const fileText = await file.text();
    const summary = await runLocalityFileImport({
      sourceKey: "csv-upload-localities",
      fileText,
      fileFormat,
      dataSource,
      triggeredByUserId: session.userId,
    });
    await logAudit(session.userId, "ingest.file-import", "IngestSource", "csv-upload-localities");
    return { summary };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Uploads and stages a CSV/JSON Transaction file — the Transaction counterpart to importProjectsFileAction. */
export async function importTransactionsFileAction(_prevState: IngestActionResult, formData: FormData): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or JSON file to upload" };

  const dataSourceRaw = formData.get("dataSource");
  const dataSource = DATA_SOURCES.find((d) => d === dataSourceRaw) as DataSource | undefined;
  if (!dataSource) return { error: "Choose the source of this file (builder, official, etc.)" };

  const fileFormat: FileFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";

  try {
    const fileText = await file.text();
    const summary = await runTransactionFileImport({
      sourceKey: "csv-upload-transactions",
      fileText,
      fileFormat,
      dataSource,
      triggeredByUserId: session.userId,
    });
    await logAudit(session.userId, "ingest.file-import", "IngestSource", "csv-upload-transactions");
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

/**
 * Applies an approved Builder staging record — create or merge, per
 * targetId. Mirrors applyProjectApproval's shape but maps fields inline
 * (Builder has no shared buildBuilderData()-style helper the way Project
 * does, and the frozen lib/actions/builders.ts is not touched by this
 * module) rather than duplicating validation the admin form doesn't share.
 */
async function applyBuilderApproval(record: { targetId: string | null; payload: unknown }): Promise<string> {
  const payload = record.payload as unknown as BuilderImportPayload;

  const data = {
    name: payload.name,
    headquarters: payload.headquarters ?? null,
    foundedYear: payload.foundedYear ?? null,
    websiteUrl: payload.websiteUrl ?? null,
    reraNumber: payload.reraNumber ?? null,
    description: payload.description ?? null,
    logoUrl: payload.logoUrl ?? null,
    dataSource: payload.dataSource,
  };

  if (record.targetId) {
    await prisma.builder.update({ where: { id: record.targetId }, data });
    return record.targetId;
  }
  const slug = await ensureUniqueSlug(payload.name, async (candidate) => {
    const existing = await prisma.builder.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });
  const created = await prisma.builder.create({
    data: { slug, ...data, isPublished: false, isFeatured: false },
    select: { id: true },
  });
  return created.id;
}

/** Applies an approved Locality staging record — create or merge, per targetId. Same inline-mapping rationale as applyBuilderApproval. */
async function applyLocalityApproval(record: { targetId: string | null; payload: unknown }): Promise<string> {
  const payload = record.payload as unknown as LocalityImportPayload;
  const hasMarketData = payload.avgPriceRupeesPerSqft !== undefined || payload.rentalYieldPercent !== undefined;

  const data = {
    name: payload.name,
    pincode: payload.pincode ?? null,
    description: payload.description ?? null,
    centroidLat: payload.centroidLat ?? null,
    centroidLng: payload.centroidLng ?? null,
    avgPricePerSqftPaise: payload.avgPriceRupeesPerSqft !== undefined ? BigInt(Math.round(payload.avgPriceRupeesPerSqft * 100)) : null,
    rentalYieldPercent: payload.rentalYieldPercent ?? null,
    marketDataSource: hasMarketData ? payload.dataSource : null,
    marketAsOf: hasMarketData ? new Date() : null,
    connectivityNotes: payload.connectivityNotes ?? null,
  };

  if (record.targetId) {
    await prisma.locality.update({ where: { id: record.targetId }, data });
    return record.targetId;
  }
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);
  const slug = await ensureUniqueSlug(payload.name, async (candidate) => {
    const existing = await prisma.locality.findFirst({ where: { cityId: city.id, slug: candidate } });
    return Boolean(existing);
  });
  const created = await prisma.locality.create({
    data: { cityId: city.id, slug, ...data, isPublished: false, isFeatured: false },
    select: { id: true },
  });
  return created.id;
}

/** Applies an approved Transaction staging record — always a create (Transaction has no merge/targetId concept, per the runner). */
async function applyTransactionApproval(record: { payload: unknown }): Promise<string> {
  const payload = record.payload as unknown as TransactionImportPayload;

  const created = await prisma.transaction.create({
    data: {
      localityId: payload.localityId,
      projectId: payload.projectId ?? null,
      type: payload.type,
      registrationDate: new Date(payload.registrationDateIso),
      valuePaise: BigInt(Math.round(payload.valueRupees * 100)),
      carpetSqft: payload.carpetSqft ?? null,
      bedrooms: payload.bedrooms ?? null,
      tower: payload.tower ?? null,
      unitLabel: payload.unitLabel ?? null,
      dataSource: payload.dataSource,
      confidence: "MEDIUM",
      sourceRef: payload.sourceRef,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Full-row snapshot of an entity for the audit trail's before/after — plain
 * findUnique with no include, so it's exactly the scalar-field shape a
 * rollback would need to restore, and exactly what logAudit's toJsonSafe
 * already knows how to serialize (Decimal/BigInt/Date).
 */
async function fetchEntitySnapshot(entityType: string, id: string): Promise<unknown> {
  switch (entityType) {
    case "Project":
      return prisma.project.findUnique({ where: { id } });
    case "Builder":
      return prisma.builder.findUnique({ where: { id } });
    case "Locality":
      return prisma.locality.findUnique({ where: { id } });
    case "Transaction":
      return prisma.transaction.findUnique({ where: { id } });
    case "InfraAsset":
      return prisma.infraAsset.findUnique({ where: { id } });
    default:
      return null;
  }
}

/** Approves a pending IngestStagingRecord — creates or merges, per the record's entityType. Gated the same as any other write-to-production step (Section 21: employees can stage, only an approver — ADMIN or an explicit data_sync.approve grant — can publish). */
export async function approveStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();
  if (!isAdmin(session.role) && !(await hasPermission(session, "data_sync.approve"))) {
    return { error: "You don't have permission to approve imported data. Ask your admin to grant it." };
  }

  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record) return { error: "Staging record not found" };
  if (record.status !== "PENDING") return { error: "This record has already been reviewed" };

  try {
    const before = record.targetId ? await fetchEntitySnapshot(record.entityType, record.targetId) : null;

    let entityId: string;
    if (record.entityType === "InfraAsset") {
      entityId = await applyInfraAssetApproval(record);
    } else if (record.entityType === "Project") {
      entityId = await applyProjectApproval(record);
    } else if (record.entityType === "Builder") {
      entityId = await applyBuilderApproval(record);
    } else if (record.entityType === "Locality") {
      entityId = await applyLocalityApproval(record);
    } else if (record.entityType === "Transaction") {
      entityId = await applyTransactionApproval(record);
    } else {
      return { error: `Unsupported entity type "${record.entityType}"` };
    }

    const after = await fetchEntitySnapshot(record.entityType, entityId);

    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "APPROVED", reviewedByUserId: session.userId, reviewedAt: new Date(), appliedEntityId: entityId },
    });
    await logAudit(session.userId, "ingest.approve", record.entityType, entityId, { before, after });
    await emit("ReviewApproved", { stagingRecordId: id, entityType: record.entityType, entityId, actorId: session.userId });
    if (record.entityType === "Transaction") {
      await emit("TransactionImported", { transactionId: entityId, batchId: record.batchId, actorId: session.userId });
    }
    return {};
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Rejects a pending IngestStagingRecord — no write to the target entity. Same approver gate as approveStagingRecordAction. */
export async function rejectStagingRecordAction(id: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();
  if (!isAdmin(session.role) && !(await hasPermission(session, "data_sync.approve"))) {
    return { error: "You don't have permission to reject imported data. Ask your admin to grant it." };
  }

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

const ROLLBACK_SOFT_DELETE_ENTITY_TYPES = new Set(["Project", "Builder", "Locality", "Transaction"]);

/**
 * Rolls back a batch's already-approved staging records. Scoped deliberately
 * narrow (Section 23: no fake automation) — only reverses the unambiguous
 * case, a record that CREATED a brand-new row (record.targetId was null),
 * by soft-deleting it into the existing Trash mechanism (same deletedAt/
 * deletedByUserId columns Project/Builder/Locality/Transaction already use).
 * A record that merged into an EXISTING row has no safe generic way to
 * restore arbitrary prior field values here, so it's left untouched and
 * counted as "needs manual review" — the entity's own History panel
 * (AuditHistory, powered by the ingest.approve entry just below) already
 * shows the exact before→after field diff for a founder to revert by hand.
 * Also skips (as "needs manual review") anything touched again after
 * approval, so a rollback can never clobber someone else's later edit.
 */
export async function rollbackBatchAction(
  batchId: string
): Promise<{ error?: string; rolledBack?: number; needsManualReview?: number }> {
  const session = await requireAdminSession();

  const batch = await prisma.ingestBatch.findUnique({ where: { id: batchId }, select: { id: true } });
  if (!batch) return { error: "Batch not found" };

  const records = await prisma.ingestStagingRecord.findMany({ where: { batchId, status: "APPROVED" } });
  if (records.length === 0) return { error: "No approved records to roll back in this batch" };

  let rolledBack = 0;
  let needsManualReview = 0;

  for (const record of records) {
    const canAutoRollback = !record.targetId && record.appliedEntityId && ROLLBACK_SOFT_DELETE_ENTITY_TYPES.has(record.entityType);
    if (!canAutoRollback) {
      needsManualReview += 1;
      continue;
    }

    const entityId = record.appliedEntityId!;
    try {
      const currentSnapshot = (await fetchEntitySnapshot(record.entityType, entityId)) as { updatedAt?: Date; deletedAt?: Date | null } | null;
      if (!currentSnapshot || currentSnapshot.deletedAt) {
        // Already gone or already in Trash — nothing left to roll back automatically.
        needsManualReview += 1;
        continue;
      }
      if (record.reviewedAt && currentSnapshot.updatedAt && currentSnapshot.updatedAt.getTime() > record.reviewedAt.getTime() + 5000) {
        // Edited by someone/something since approval — don't silently discard that later edit.
        needsManualReview += 1;
        continue;
      }

      const deleteData =
        record.entityType === "Transaction"
          ? { deletedAt: new Date(), deletedByUserId: session.userId }
          : { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true };

      if (record.entityType === "Project") await prisma.project.update({ where: { id: entityId }, data: deleteData });
      else if (record.entityType === "Builder") await prisma.builder.update({ where: { id: entityId }, data: deleteData });
      else if (record.entityType === "Locality") await prisma.locality.update({ where: { id: entityId }, data: deleteData });
      else if (record.entityType === "Transaction") await prisma.transaction.update({ where: { id: entityId }, data: deleteData });

      await prisma.ingestStagingRecord.update({
        where: { id: record.id },
        data: { status: "ROLLED_BACK", rolledBackAt: new Date(), rolledBackByUserId: session.userId },
      });
      await logAudit(session.userId, "ingest.rollback", record.entityType, entityId, {
        before: { deletedAt: null },
        after: { deletedAt: deleteData.deletedAt },
      });
      rolledBack += 1;
    } catch {
      needsManualReview += 1;
    }
  }

  await logAudit(session.userId, "ingest.batch.rollback", "IngestBatch", batchId, { after: { rolledBack, needsManualReview } });
  revalidateInfra();
  return { rolledBack, needsManualReview };
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

/**
 * Re-runs a failed batch's connector. Only meaningful for API-based sources
 * (e.g. the OSM connector) — a file-upload batch's original bytes aren't
 * retained, so a failed file import must be re-uploaded, not "retried".
 */
export async function retryFailedBatchAction(batchId: string): Promise<IngestActionResult> {
  const session = await requireMutateSession();

  const batch = await prisma.ingestBatch.findUnique({ where: { id: batchId }, select: { sourceKey: true, status: true } });
  if (!batch) return { error: "Batch not found" };
  if (batch.status !== "failed") return { error: "Only failed batches can be retried" };

  const source = await prisma.ingestSource.findUnique({ where: { key: batch.sourceKey }, select: { kind: true } });
  if (!source || source.kind !== "API") {
    return { error: "This batch's source can't be retried automatically — re-upload the file instead" };
  }

  try {
    const summary = await runIngestBatch(batch.sourceKey, "manual", session.userId);
    await logAudit(session.userId, "ingest.retry", "IngestSource", batch.sourceKey);
    revalidateInfra();
    return { summary };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}
