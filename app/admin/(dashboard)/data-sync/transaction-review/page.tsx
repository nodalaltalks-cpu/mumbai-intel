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
 * Transaction Review Queue (Phase 16B) — a SEPARATE page from the existing
 * Project Review Queue (/admin/data-sync/review, untouched by this phase).
 * Reuses the same existing `getPendingStagingRecords()` query (no new query,
 * no new persistence) and simply filters to `entityType === "Transaction"`,
 * exactly mirroring how the Project page already filters its own records by
 * entityType. Transactions never carry a `matchedExistingId` (see
 * transactionFileImportRunner.ts — `targetId` is always null; a Transaction
 * is deduplicated by a content-hash `sourceRef` check at import time, not
 * proposed as a merge candidate), so there is no "possible match" panel here
 * the way the Project queue has one.
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

  const reviewRecords: TransactionReviewRecord[] = transactionRecords.map((record) => {
    const payload = record.payload as unknown as TransactionImportPayload;
    const localityName = localityNameById.get(payload.localityId);
    const projectName = payload.projectId ? projectNameById.get(payload.projectId) : undefined;

    const proposedLines: string[] = [
      [TRANSACTION_TYPE_LABEL[payload.type as TransactionType], formatPaise(payload.valueRupees * 100)].join(" · "),
      [localityName ?? "Unknown locality", projectName].filter(Boolean).join(" · "),
    ];

    const completeness = buildTransactionReviewCompleteness(payload, { localityName, projectName });

    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      sourceKey: record.batch.sourceKey,
      proposedTitle: `${TRANSACTION_TYPE_LABEL[payload.type as TransactionType]} · ${formatDate(payload.registrationDateIso)}`,
      proposedLines,
      matchNote: "New transaction record — no duplicate/merge check applies (transactions are deduplicated by a content hash at import time, never proposed as a merge).",
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
