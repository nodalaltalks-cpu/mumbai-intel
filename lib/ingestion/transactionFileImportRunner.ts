import "server-only";
import { createHash } from "crypto";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { parseCsv } from "./connectors/fileImport/csvParser";
import { mapRowToTransactionFields } from "./connectors/fileImport/columnMapping";
import { validateTransactionRow, type ValidatedTransactionRow } from "./connectors/fileImport/validateTransactionRow";
import type { TransactionImportPayload } from "./connectors/fileImport/types";
import { findPossibleDuplicateTransaction } from "./duplicateMatch";
import type { ConnectorRunSummary } from "./types";
import type { FileFormat } from "./fileImportRunner";

function parseRows(fileText: string, format: FileFormat): Record<string, unknown>[] {
  if (format === "csv") return parseCsv(fileText).rows;
  const parsed = JSON.parse(fileText);
  if (!Array.isArray(parsed)) throw new Error("JSON import must be an array of row objects");
  return parsed;
}

/**
 * Content-derived idempotency key — deliberately independent of row
 * position within any particular file. A prior version keyed this as
 * `${sourceKey}:row-${rowNumber}`, which meant row 1 of *every* upload ever
 * made under the same sourceKey collided with row 1 of every other upload,
 * silently discarding real transactions on any second file. Hashing the
 * transaction's own stable fields means only a genuinely identical
 * transaction (same locality/project/date/value/area/unit) is ever treated
 * as a duplicate, regardless of which file or row it came from.
 */
function computeSourceRef(sourceKey: string, row: ValidatedTransactionRow): string {
  const stable = JSON.stringify({
    type: row.type,
    date: row.registrationDate.toISOString(),
    value: row.valueRupees,
    carpet: row.carpetSqft ?? null,
    bedrooms: row.bedrooms ?? null,
    tower: row.tower?.trim().toLowerCase() ?? null,
    unit: row.unitLabel?.trim().toLowerCase() ?? null,
    locality: row.localityName.trim().toLowerCase(),
    project: row.projectName?.trim().toLowerCase() ?? null,
  });
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 24);
  return `${sourceKey}:${hash}`;
}

interface PendingLogEntry {
  entityType: string;
  entityId: string | null;
  action: string;
  message: string | null;
}

/**
 * Bulk-import runner for uploaded Transaction files (CSV/JSON) — the
 * Transaction counterpart to runProjectFileImport. This is the pipeline
 * that finally gives the platform's Transaction model (already designed as
 * "manual now, IGR later" — see prisma/schema.prisma) a bulk-import path,
 * and produces the TransactionImported event once approved.
 *
 * All row parsing/validation/dedup-checking happens in memory first; the
 * database writes for every row then fire concurrently via `Promise.allSettled`
 * instead of one `await` at a time. NOT `createMany` — the Neon HTTP adapter
 * has no transaction support and Prisma's `createMany` needs one internally
 * even for a same-shape batch (see lib/ingestion/runner.ts), so it fails
 * outright on this adapter. Concurrent single-row `create()` calls (the same
 * remedy used by updateManyByRow in lib/actions/errors.ts for bulk updates)
 * keep every write a single HTTP round trip while no longer waiting for each
 * one to finish before starting the next — a prior version awaited up to two
 * sequential single-row `create` calls per row, meaning a few-hundred-row
 * file meant a few-hundred sequential network round trips to Neon.
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
  const logEntries: PendingLogEntry[] = [];
  const stagingRecords: {
    entityType: "Transaction";
    targetId: null;
    matchedExistingId: string | null;
    matchConfidence: number | null;
    payload: Prisma.InputJsonValue;
  }[] = [];

  try {
    const rawRows = parseRows(fileText, fileFormat);
    if (rawRows.length === 0) throw new Error("File contained no data rows");

    const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
    if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

    // Batch reads — once per run, not once per row.
    const [localities, projects, existingSourceRefs, pendingTransactionStaging] = await Promise.all([
      prisma.locality.findMany({
        where: { cityId: city.id },
        // Phase 19: LocalityAlias already existed (its own doc comment names
        // "IGR" as an example alias source) but had no consumer yet -- wiring
        // it in here lets "Andheri W." / colloquial IGR spellings resolve
        // without creating a duplicate Locality or a new matching system.
        select: { id: true, name: true, aliases: { select: { alias: true } } },
      }),
      prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true } }),
      prisma.transaction.findMany({ where: { dataSource }, select: { id: true, sourceRef: true } }),
      // The only other place a duplicate real-world document number could
      // already be sitting is another still-PENDING Transaction staging
      // record (nothing has become a live Transaction yet) -- checked
      // separately from existingSourceRefs above, which only covers rows
      // already approved into the live table.
      prisma.ingestStagingRecord.findMany({
        where: { entityType: "Transaction", status: "PENDING" },
        select: { id: true, payload: true },
      }),
    ]);
    const localityByName = new Map<string, string>();
    for (const locality of localities) {
      localityByName.set(locality.name.trim().toLowerCase(), locality.id);
      for (const { alias } of locality.aliases) {
        const key = alias.trim().toLowerCase();
        if (!localityByName.has(key)) localityByName.set(key, locality.id);
      }
    }
    const projectByName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const existingSourceRefSet = new Set(existingSourceRefs.map((t) => t.sourceRef).filter((r): r is string => r !== null));
    const liveTransactionBySourceRef = new Map(
      existingSourceRefs.filter((t): t is typeof t & { sourceRef: string } => t.sourceRef !== null).map((t) => [t.sourceRef, t.id])
    );
    const pendingStagingCandidates = pendingTransactionStaging.map((r) => ({
      id: r.id,
      sourceRef: (r.payload as unknown as TransactionImportPayload).sourceRef ?? null,
    }));
    // Guards against the same file containing two literally-identical rows.
    const seenInThisRun = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 1;
      try {
        const mapped = mapRowToTransactionFields(rawRows[i]);
        const validated = validateTransactionRow(mapped);
        if (!validated.ok) {
          summary.failed += 1;
          logEntries.push({ entityType: "Transaction", entityId: null, action: "FAILED", message: `Row ${rowNumber}: ${validated.error}` });
          continue;
        }
        const row = validated.data;

        const localityId = localityByName.get(row.localityName.trim().toLowerCase());
        if (!localityId) {
          summary.failed += 1;
          logEntries.push({
            entityType: "Transaction",
            entityId: null,
            action: "FAILED",
            message: `Row ${rowNumber}: locality "${row.localityName}" not found — add it in the admin panel first`,
          });
          continue;
        }

        const projectId = row.projectName ? projectByName.get(row.projectName.trim().toLowerCase()) : undefined;

        // A real external document/registration number (when supplied) IS the
        // sourceRef -- a genuine identifier, and the strongest possible dedup
        // signal (Phase 19 Part I). Only falls back to the synthetic content
        // hash when a source doesn't provide one, exactly as before.
        const hasRealRegistrationNumber = Boolean(row.registrationNumber);
        const sourceRef = row.registrationNumber?.trim() || computeSourceRef(sourceKey, row);

        // The synthetic content hash encodes every relevant field at once, so
        // an exact match there truly does mean identical content -- safe to
        // silently skip, exactly as before. A REAL registration number
        // matching is NOT the same guarantee (two genuinely different
        // transactions could share a mistyped document number while
        // differing everywhere else) -- so it is never silently skipped here;
        // it always stages, and is instead flagged for human review below.
        if (!hasRealRegistrationNumber) {
          if (existingSourceRefSet.has(sourceRef) || seenInThisRun.has(sourceRef)) {
            summary.skipped += 1;
            logEntries.push({
              entityType: "Transaction",
              entityId: null,
              action: "SKIPPED_DUPLICATE",
              message: `Row ${rowNumber}: an identical transaction has already been imported (sourceRef "${sourceRef}")`,
            });
            continue;
          }
          seenInThisRun.add(sourceRef);
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
          confidence: row.confidence,
          sourceNote: row.sourceNote,
        };

        // Transactions are discrete event records, not "the same place possibly
        // duplicated" the way Project/Builder/Locality are -- targetId stays
        // null always (no merge concept, per applyTransactionApproval). But a
        // real registration number matching another still-PENDING staging
        // record IS a genuine "look at this" signal (Phase 19 Part I) --
        // surfaced via matchedExistingId/matchConfidence (purely informational
        // columns; never read by the approval/merge logic, confirmed against
        // lib/actions/ingestion.ts), never silently merged or discarded.
        const possibleDuplicate = hasRealRegistrationNumber
          ? findPossibleDuplicateTransaction(pendingStagingCandidates, { registrationNumber: row.registrationNumber })
          : null;

        // A real registration number matching an ALREADY-APPROVED live
        // Transaction is the other real-world case (an overlapping re-import)
        // -- matchedExistingId can't point at it the same way (the Review
        // Queue only resolves that column against other staging records, not
        // live Transactions), so this is surfaced the same way any other
        // "look before approving" fact is: appended to the row's own
        // sourceNote, which the Review Queue already displays -- never a
        // silent skip, never a silent duplicate creation.
        const liveMatchId = hasRealRegistrationNumber ? liveTransactionBySourceRef.get(sourceRef) : undefined;
        if (liveMatchId) {
          const warning = `⚠ Registration number matches an already-approved transaction (id ${liveMatchId}) — verify before approving.`;
          payload.sourceNote = payload.sourceNote ? `${warning} ${payload.sourceNote}` : warning;
        }

        stagingRecords.push({
          entityType: "Transaction",
          targetId: null,
          matchedExistingId: possibleDuplicate?.existingId ?? null,
          matchConfidence: possibleDuplicate?.confidence ?? null,
          payload: payload as unknown as Prisma.InputJsonValue,
        });
        summary.staged += 1;
        logEntries.push({
          entityType: "Transaction",
          entityId: null,
          action: possibleDuplicate || liveMatchId ? "STAGED_POSSIBLE_DUPLICATE" : "STAGED",
          message: possibleDuplicate
            ? `Row ${rowNumber}: ${row.type} in "${row.localityName}" — registration number matches a transaction already pending review (staging record ${possibleDuplicate.existingId}); flagged for human review, not merged`
            : liveMatchId
              ? `Row ${rowNumber}: ${row.type} in "${row.localityName}" — registration number matches already-approved transaction ${liveMatchId}; staged anyway with a source-note warning, not merged`
              : `Row ${rowNumber}: ${row.type} in "${row.localityName}"${row.projectName ? ` (${row.projectName})` : ""} — awaiting review`,
        });
      } catch (error) {
        summary.failed += 1;
        logEntries.push({
          entityType: "Transaction",
          entityId: null,
          action: "FAILED",
          message: `Row ${rowNumber}: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }

    await Promise.allSettled([
      ...stagingRecords.map((r) =>
        prisma.ingestStagingRecord.create({
          data: {
            batchId: batch.id,
            entityType: r.entityType,
            targetId: r.targetId,
            matchedExistingId: r.matchedExistingId,
            matchConfidence: r.matchConfidence,
            payload: r.payload,
          },
        })
      ),
      ...logEntries.map((l) =>
        prisma.ingestLogEntry.create({ data: { batchId: batch.id, entityType: l.entityType, entityId: l.entityId, action: l.action, message: l.message } })
      ),
    ]);

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
    // Best-effort — the batch's failed status is the priority; logging that
    // the log-write itself failed would recurse into the same problem.
    try {
      await Promise.allSettled(
        logEntries.map((l) =>
          prisma.ingestLogEntry.create({ data: { batchId: batch.id, entityType: l.entityType, entityId: l.entityId, action: l.action, message: l.message } })
        )
      );
    } catch {
      // Ignore — see comment above.
    }
    await prisma.ingestBatch.update({
      where: { id: batch.id },
      data: { status: "failed", finishedAt: new Date(), note: error instanceof Error ? error.message : "Unknown error" },
    });
    throw error;
  }

  return summary;
}
