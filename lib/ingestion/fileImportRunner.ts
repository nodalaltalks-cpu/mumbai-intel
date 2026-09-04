import "server-only";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { parseCsv } from "./connectors/fileImport/csvParser";
import { mapRowToProjectFields } from "./connectors/fileImport/columnMapping";
import { validateProjectRow } from "./connectors/fileImport/validateProjectRow";
import type { ProjectImportPayload } from "./connectors/fileImport/types";
import { findPossibleDuplicateProject, type ExistingProjectCandidate } from "./duplicateMatch";
import type { ConnectorRunSummary } from "./types";

export type FileFormat = "csv" | "json";

async function logEntry(batchId: string, entityType: string, entityId: string | null, action: string, message: string | null) {
  try {
    await prisma.ingestLogEntry.create({ data: { batchId, entityType, entityId, action, message } });
  } catch (error) {
    console.error("[file-import] failed to write log entry", error);
  }
}

function parseRows(fileText: string, format: FileFormat): Record<string, unknown>[] {
  if (format === "csv") return parseCsv(fileText).rows;
  const parsed = JSON.parse(fileText);
  if (!Array.isArray(parsed)) throw new Error("JSON import must be an array of row objects");
  return parsed;
}

/**
 * Bulk-import runner for uploaded Project files (CSV/JSON) — the file-based
 * counterpart to runIngestBatch's API-based connectors. Every row (new or
 * matching an existing Project) always becomes an IngestStagingRecord —
 * nothing writes to the Project table directly here, per the "never
 * auto-publish imported catalog data" policy. Same batched-reads discipline
 * as the OSM runner: existing Localities/Builders/Projects are each
 * fetched once, not once per row.
 */
export async function runProjectFileImport(params: {
  sourceKey: string;
  fileText: string;
  fileFormat: FileFormat;
  dataSource: DataSource;
  /** Omitted for an unattended/scheduled run (e.g. the Apify webhook bridge) — no human triggered it. */
  triggeredByUserId?: string;
  /** Defaults to "manual" (the only value every existing caller has ever passed) so nothing changes for them. */
  trigger?: "manual" | "scheduled";
}): Promise<ConnectorRunSummary> {
  const { sourceKey, fileText, fileFormat, dataSource, triggeredByUserId, trigger = "manual" } = params;

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey, trigger, triggeredByUserId: triggeredByUserId ?? null, status: "running" },
  });

  const summary: ConnectorRunSummary = { written: 0, skipped: 0, staged: 0, failed: 0 };

  try {
    const rawRows = parseRows(fileText, fileFormat);
    if (rawRows.length === 0) throw new Error("File contained no data rows");

    const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
    if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

    // Batch reads — once per run, not once per row.
    const [localities, builders, existingProjectsRaw] = await Promise.all([
      prisma.locality.findMany({ where: { cityId: city.id }, select: { id: true, name: true } }),
      prisma.builder.findMany({ select: { id: true, name: true, legalNames: true } }),
      prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    ]);
    const localityByName = new Map(localities.map((l) => [l.name.trim().toLowerCase(), l.id]));
    const builderByName = new Map<string, string>();
    for (const b of builders) {
      builderByName.set(b.name.trim().toLowerCase(), b.id);
      for (const legalName of b.legalNames) builderByName.set(legalName.trim().toLowerCase(), b.id);
    }
    const existingProjects: ExistingProjectCandidate[] = existingProjectsRaw;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 1;
      try {
        const mapped = mapRowToProjectFields(rawRows[i]);
        const validated = validateProjectRow(mapped);
        if (!validated.ok) {
          summary.failed += 1;
          await logEntry(batch.id, "Project", null, "FAILED", `Row ${rowNumber}: ${validated.error}`);
          continue;
        }
        const row = validated.data;

        const localityId = localityByName.get(row.localityName.trim().toLowerCase());
        if (!localityId) {
          summary.failed += 1;
          await logEntry(batch.id, "Project", null, "FAILED", `Row ${rowNumber}: locality "${row.localityName}" not found — add it in the admin panel first`);
          continue;
        }

        const builderId = row.builderName ? builderByName.get(row.builderName.trim().toLowerCase()) : undefined;

        const duplicate = findPossibleDuplicateProject(existingProjects, {
          name: row.name,
          localityId,
          reraNumber: row.reraNumber,
        });

        const payload: ProjectImportPayload = {
          name: row.name,
          reraNumber: row.reraNumber,
          address: row.address,
          status: row.status,
          category: row.category,
          totalUnits: row.totalUnits,
          totalTowers: row.totalTowers,
          priceMinRupees: row.priceMinRupees,
          possessionDateIso: row.possessionDate?.toISOString(),
          launchDateIso: row.launchDate?.toISOString(),
          builderId,
          developerGroup: !builderId ? row.builderName : undefined,
          localityId,
          description: row.description,
          dataSource,
          sourceRef: row.reraNumber ?? `${sourceKey}:row-${rowNumber}`,
        };

        await prisma.ingestStagingRecord.create({
          data: {
            batchId: batch.id,
            entityType: "Project",
            targetId: duplicate?.existingId ?? null,
            payload: payload as unknown as Prisma.InputJsonValue,
            matchedExistingId: duplicate?.existingId ?? null,
            matchConfidence: duplicate?.confidence ?? null,
          },
        });
        summary.staged += 1;
        await logEntry(
          batch.id,
          "Project",
          duplicate?.existingId ?? null,
          "STAGED",
          duplicate
            ? `Row ${rowNumber}: "${row.name}" — proposed update to an existing project (matched by ${duplicate.reason}, confidence ${duplicate.confidence.toFixed(2)})`
            : `Row ${rowNumber}: "${row.name}" — new project, awaiting review`
        );
      } catch (error) {
        summary.failed += 1;
        await logEntry(batch.id, "Project", null, "FAILED", `Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
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
  } catch (error) {
    await prisma.ingestBatch.update({
      where: { id: batch.id },
      data: { status: "failed", finishedAt: new Date(), note: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }

  return summary;
}
