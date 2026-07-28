import "server-only";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "./connectors/fileImport/csvParser";
import { mapRowToBuilderFields } from "./connectors/fileImport/columnMapping";
import { validateBuilderRow } from "./connectors/fileImport/validateBuilderRow";
import type { BuilderImportPayload } from "./connectors/fileImport/types";
import { findPossibleDuplicateBuilder, type ExistingBuilderCandidate } from "./duplicateMatch";
import type { ConnectorRunSummary } from "./types";
import type { FileFormat } from "./fileImportRunner";

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
 * Bulk-import runner for uploaded Builder files (CSV/JSON) — the Builder
 * counterpart to runProjectFileImport (lib/ingestion/fileImportRunner.ts),
 * same pipeline shape: parse → validate → duplicate-check → always stage,
 * never write directly.
 */
export async function runBuilderFileImport(params: {
  sourceKey: string;
  fileText: string;
  fileFormat: FileFormat;
  dataSource: DataSource;
  triggeredByUserId: string;
}): Promise<ConnectorRunSummary> {
  const { sourceKey, fileText, fileFormat, dataSource, triggeredByUserId } = params;

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey, trigger: "manual", triggeredByUserId, status: "running" },
  });

  const summary: ConnectorRunSummary = { written: 0, skipped: 0, staged: 0, failed: 0 };

  try {
    const rawRows = parseRows(fileText, fileFormat);
    if (rawRows.length === 0) throw new Error("File contained no data rows");

    const existingBuildersRaw = await prisma.builder.findMany({ select: { id: true, name: true, reraNumber: true } });
    const existingBuilders: ExistingBuilderCandidate[] = existingBuildersRaw;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 1;
      try {
        const mapped = mapRowToBuilderFields(rawRows[i]);
        const validated = validateBuilderRow(mapped);
        if (!validated.ok) {
          summary.failed += 1;
          await logEntry(batch.id, "Builder", null, "FAILED", `Row ${rowNumber}: ${validated.error}`);
          continue;
        }
        const row = validated.data;

        const duplicate = findPossibleDuplicateBuilder(existingBuilders, { name: row.name, reraNumber: row.reraNumber });

        const payload: BuilderImportPayload = {
          name: row.name,
          headquarters: row.headquarters,
          foundedYear: row.foundedYear,
          websiteUrl: row.websiteUrl,
          reraNumber: row.reraNumber,
          description: row.description,
          logoUrl: row.logoUrl,
          dataSource,
          sourceRef: row.reraNumber ?? `${sourceKey}:row-${rowNumber}`,
        };

        await prisma.ingestStagingRecord.create({
          data: {
            batchId: batch.id,
            entityType: "Builder",
            targetId: duplicate?.existingId ?? null,
            payload: payload as unknown as Prisma.InputJsonValue,
            matchedExistingId: duplicate?.existingId ?? null,
            matchConfidence: duplicate?.confidence ?? null,
          },
        });
        summary.staged += 1;
        await logEntry(
          batch.id,
          "Builder",
          duplicate?.existingId ?? null,
          "STAGED",
          duplicate
            ? `Row ${rowNumber}: "${row.name}" — proposed update to an existing builder (confidence ${duplicate.confidence.toFixed(2)})`
            : `Row ${rowNumber}: "${row.name}" — new builder, awaiting review`
        );
      } catch (error) {
        summary.failed += 1;
        await logEntry(batch.id, "Builder", null, "FAILED", `Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
