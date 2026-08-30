import type { Metadata } from "next";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPaise } from "@/lib/format";
import { TRANSACTION_TYPE_LABEL, type TransactionType } from "@/lib/project-meta";
import type { TransactionImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { buildTransactionReviewCompleteness } from "@/lib/ingestion/transactionFieldRegistry";
import TransactionReviewList, { type TransactionReviewRecord } from "@/app/admin/components/TransactionReviewList";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = { title: "Transaction Review — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * Transaction Review Queue (Phase 16B, extended Phase 19) — a SEPARATE page
 * from the existing Project Review Queue (/admin/data-sync/review, untouched
 * by this and every prior phase). Reuses the same existing
 * `getPendingStagingRecords()` query (no new query, no new persistence) and
 * simply filters to `entityType === "Transaction"`, exactly mirroring how the
 * Project page already filters its own records by entityType.
 *
 * `targetId` stays permanently null for every Transaction (no merge concept,
 * per applyTransactionApproval) -- but Phase 19 wires up `matchedExistingId`/
 * `matchConfidence` (purely informational columns, never read by the
 * approval/merge logic) to flag a real registration-number collision against
 * another still-PENDING Transaction staging record. When set, this page
 * resolves that OTHER staging record's own payload to build a real,
 * human-readable "possible duplicate of ..." note -- never a fabricated one.
 */
export default async function TransactionReviewPage() {
  const records = await getPendingStagingRecords();
  const transactionRecords = records.filter((r) => r.entityType === "Transaction");

  const localityIds = [
    ...new Set(transactionRecords.map((r) => (r.payload as unknown as TransactionImportPayload).localityId)),
  ];
  const localities = localityIds.length
    ? await prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } })
    : [];
  const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

  const projectIds = [
    ...new Set(
      transactionRecords
        .map((r) => (r.payload as unknown as TransactionImportPayload).projectId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
    : [];
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const matchedStagingIds = [
    ...new Set(transactionRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id))),
  ];
  const matchedStagingRecords = matchedStagingIds.length
    ? await prisma.ingestStagingRecord.findMany({ where: { id: { in: matchedStagingIds } }, select: { id: true, payload: true, createdAt: true } })
    : [];
  const matchedStagingById = new Map(matchedStagingRecords.map((r) => [r.id, r]));

  const reviewRecords: TransactionReviewRecord[] = transactionRecords.map((record) => {
    const payload = record.payload as unknown as TransactionImportPayload;
    const localityName = localityNameById.get(payload.localityId);
    const projectName = payload.projectId ? projectNameById.get(payload.projectId) : undefined;

    const proposedLines: string[] = [
      [TRANSACTION_TYPE_LABEL[payload.type as TransactionType], formatPaise(payload.valueRupees * 100)].join(" · "),
      [localityName ?? "Unknown locality", projectName].filter(Boolean).join(" · "),
    ];

    const matched = record.matchedExistingId ? matchedStagingById.get(record.matchedExistingId) : null;
    let matchNote =
      "New transaction record — no duplicate/merge check applies (transactions are deduplicated by a content hash or registration number at import time, never proposed as a merge).";
    let possibleDuplicateNote: string | undefined;
    if (matched) {
      const matchedPayload = matched.payload as unknown as TransactionImportPayload;
      const confidencePct = record.matchConfidence !== null ? Math.round(Number(record.matchConfidence) * 100) : null;
      possibleDuplicateNote = `Registration number matches staging record ${matched.id} (staged ${formatDate(matched.createdAt)})`;
      matchNote = `🟠 Possible duplicate — registration number "${payload.sourceRef}" matches a transaction already pending review: ${
        TRANSACTION_TYPE_LABEL[matchedPayload.type as TransactionType]
      } · ${formatDate(matchedPayload.registrationDateIso)} · ${formatPaise(matchedPayload.valueRupees * 100)}${
        confidencePct !== null ? ` (confidence ${confidencePct}%)` : ""
      }. Not merged automatically — review both before approving.`;
    }

    const completeness = buildTransactionReviewCompleteness(payload, { localityName, projectName, possibleDuplicateNote });

    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      sourceKey: record.batch.sourceKey,
      proposedTitle: `${TRANSACTION_TYPE_LABEL[payload.type as TransactionType]} · ${formatDate(payload.registrationDateIso)}`,
      proposedLines,
      matchNote,
      hasPossibleDuplicate: Boolean(matched),
      completeness,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Transaction Review</h1>
        <p className="text-xs text-muted">
          Imported transaction candidates awaiting a decision — separate from Project Review. Nothing here has touched the catalog yet.
        </p>
      </div>

      {reviewRecords.length === 0 ? (
        <EmptyState title="Nothing to review" message="All imported transactions were already processed." />
      ) : (
        <TransactionReviewList records={reviewRecords} />
      )}
    </div>
  );
}
