import "server-only";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { parseCsv } from "./connectors/fileImport/csvParser";
import { mapRowToTransactionFields } from "./connectors/fileImport/columnMapping";
import { validateTransactionRow } from "./connectors/fileImport/validateTransactionRow";
import type { TransactionImportPayload } from "./connectors/fileImport/types";
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
 * Bulk-import runner for uploaded Transaction files (CSV/JSON) — the
 * Transaction counterpart to runProjectFileImport. This is the pipeline
 * that finally gives the platform's Transaction model (already designed as
 * "manual now, IGR later" — see prisma/schema.prisma) a bulk-import path,
 * and produces the TransactionImported event once approved.
 */
export async function runTransactionFileImport(params: {
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

    // Batch reads — once per run, not once per row.
    const [localities, projects, existingSourceRefs] = await Promise.all([
      prisma.locality.findMany({ where: { cityId: city.id }, select: { id: true, name: true } }),
      prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true } }),
      prisma.transaction.findMany({ where: { dataSource }, select: { sourceRef: true } }),
    ]);
    const localityByName = new Map(localities.map((l) => [l.name.trim().toLowerCase(), l.id]));
    const projectByName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const existingSourceRefSet = new Set(existingSourceRefs.map((t) => t.sourceRef).filter((r): r is string => r !== null));

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 1;
      try {
        const mapped = mapRowToTransactionFields(rawRows[i]);
        const validated = validateTransactionRow(mapped);
        if (!validated.ok) {
          summary.failed += 1;
          await logEntry(batch.id, "Transaction", null, "FAILED", `Row ${rowNumber}: ${validated.error}`);
          continue;
        }
        const row = validated.data;

        const localityId = localityByName.get(row.localityName.trim().toLowerCase());
        if (!localityId) {
          summary.failed += 1;
          await logEntry(batch.id, "Transaction", null, "FAILED", `Row ${rowNumber}: locality "${row.localityName}" not found — add it in the admin panel first`);
          continue;
        }

        const projectId = row.projectName ? projectByName.get(row.projectName.trim().toLowerCase()) : undefined;

        const sourceRef = `${sourceKey}:row-${rowNumber}`;
        if (existingSourceRefSet.has(sourceRef)) {
          summary.skipped += 1;
          await logEntry(batch.id, "Transaction", null, "SKIPPED_DUPLICATE", `Row ${rowNumber}: already imported from this source (sourceRef "${sourceRef}")`);
          continue;
        }

        const payload: TransactionImportPayload = {
          localityId,
          projectId,
          type: row.type,
          registrationDateIso: row.registrationDate.toISOString(),
          valueRupees: row.valueRupees,
          carpetSqft: row.carpetSqft,
          bedrooms: row.bedrooms,
          tower: row.tower,
          unitLabel: row.unitLabel,
          dataSource,
          sourceRef,
        };

        // Transactions are discrete event records, not "the same place possibly
        // duplicated" the way Project/Builder/Locality are — there is no
        // duplicate-match candidate here, only the sourceRef idempotency check
        // above. Every valid row not already imported is staged for review.
        await prisma.ingestStagingRecord.create({
          data: {
            batchId: batch.id,
            entityType: "Transaction",
            targetId: null,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        summary.staged += 1;
        await logEntry(
          batch.id,
          "Transaction",
          null,
          "STAGED",
          `Row ${rowNumber}: ${row.type} in "${row.localityName}"${row.projectName ? ` (${row.projectName})` : ""} — awaiting review`
        );
      } catch (error) {
        summary.failed += 1;
        await logEntry(batch.id, "Transaction", null, "FAILED", `Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
