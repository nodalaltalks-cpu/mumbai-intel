import "server-only";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { parseCsv } from "./connectors/fileImport/csvParser";
import { mapRowToLocalityFields } from "./connectors/fileImport/columnMapping";
import { validateLocalityRow } from "./connectors/fileImport/validateLocalityRow";
import type { LocalityImportPayload } from "./connectors/fileImport/types";
import { findPossibleDuplicateLocality, type ExistingLocalityCandidate } from "./duplicateMatch";
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

/** Bulk-import runner for uploaded Locality files (CSV/JSON) — the Locality counterpart to runProjectFileImport. */
export async function runLocalityFileImport(params: {
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

    const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
    if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

    const existingLocalitiesRaw = await prisma.locality.findMany({ where: { cityId: city.id }, select: { id: true, name: true } });
    const existingLocalities: ExistingLocalityCandidate[] = existingLocalitiesRaw;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 1;
      try {
        const mapped = mapRowToLocalityFields(rawRows[i]);
        const validated = validateLocalityRow(mapped);
        if (!validated.ok) {
          summary.failed += 1;
          await logEntry(batch.id, "Locality", null, "FAILED", `Row ${rowNumber}: ${validated.error}`);
          continue;
        }
        const row = validated.data;

        const duplicate = findPossibleDuplicateLocality(existingLocalities, row.name);

        const payload: LocalityImportPayload = {
          name: row.name,
          pincode: row.pincode,
          description: row.description,
          centroidLat: row.centroidLat,
          centroidLng: row.centroidLng,
          avgPriceRupeesPerSqft: row.avgPriceRupeesPerSqft,
          rentalYieldPercent: row.rentalYieldPercent,
          connectivityNotes: row.connectivityNotes,
          dataSource,
          sourceRef: `${sourceKey}:row-${rowNumber}`,
        };

        await prisma.ingestStagingRecord.create({
          data: {
            batchId: batch.id,
            entityType: "Locality",
            targetId: duplicate?.existingId ?? null,
            payload: payload as unknown as Prisma.InputJsonValue,
            matchedExistingId: duplicate?.existingId ?? null,
            matchConfidence: duplicate?.confidence ?? null,
          },
        });
        summary.staged += 1;
        await logEntry(
          batch.id,
          "Locality",
          duplicate?.existingId ?? null,
          "STAGED",
          duplicate
            ? `Row ${rowNumber}: "${row.name}" — proposed update to an existing locality (confidence ${duplicate.confidence.toFixed(2)})`
            : `Row ${rowNumber}: "${row.name}" — new locality, awaiting review`
        );
      } catch (error) {
        summary.failed += 1;
        await logEntry(batch.id, "Locality", null, "FAILED", `Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
