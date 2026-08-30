"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveStagingRecordAction,
  bulkApproveStagingRecordsAction,
  bulkRejectStagingRecordsAction,
  rejectStagingRecordAction,
} from "@/lib/actions/ingestion";
import { formatDate } from "@/lib/format";
import type { ReviewCompleteness } from "@/lib/ingestion/transactionFieldRegistry";
import ConfirmButton from "./ConfirmButton";
import TransactionDataDetailsDialog from "./TransactionDataDetailsDialog";

export interface TransactionReviewRecord {
  id: string;
  createdAt: string;
  sourceKey: string;
  proposedTitle: string;
  proposedLines: string[];
  matchNote: string;
  /** Real signal only (Phase 19): a registration-number collision against another PENDING Transaction staging record. */
  hasPossibleDuplicate: boolean;
  completeness: ReviewCompleteness;
}

/**
 * Transaction Review Queue list (Phase 16B) — deliberately parallel to, but
 * separate from, ReviewQueueList.tsx (Project Review, untouched by this
 * phase). Reuses the EXACT same approve/reject/bulk actions from
 * lib/actions/ingestion.ts -- those are already entityType-agnostic
 * (approveStagingRecordAction dispatches to applyTransactionApproval for
 * entityType "Transaction") -- no second persistence mechanism.
 */
export default function TransactionReviewList({ records }: { records: TransactionReviewRecord[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [detailsRecordId, setDetailsRecordId] = useState<string | null>(null);
  const detailsRecord = records.find((r) => r.id === detailsRecordId) ?? null;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === records.length ? new Set() : new Set(records.map((r) => r.id))));
  }

  function runBulkApprove() {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkApproveStagingRecordsAction(Array.from(selected));
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      if (result.failed) setBulkError(`${result.failed} record(s) failed to approve`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function runBulkReject() {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkRejectStagingRecordsAction(Array.from(selected));
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      if (result.failed) setBulkError(`${result.failed} record(s) failed to reject`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
          Select all
        </label>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2">
            <span className="text-xs text-foreground">{selected.size} selected</span>
            <button
              type="button"
              disabled={isPending}
              onClick={runBulkApprove}
              className="rounded-sm border border-positive/40 px-2 py-1 text-[11px] font-mono uppercase text-positive hover:bg-positive/10"
            >
              Bulk Approve
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={runBulkReject}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
            >
              Bulk Reject
            </button>
            {bulkError ? <span className="text-[11px] text-negative">{bulkError}</span> : null}
          </div>
        ) : null}
      </div>

      {records.map((record) => (
        <div key={record.id} className="rounded-sm border border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(record.id)}
                onChange={() => toggleOne(record.id)}
                className="mt-1 h-3.5 w-3.5 accent-accent"
              />
              <div className="grid flex-1 grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    Proposed (from {record.sourceKey} · {formatDate(record.createdAt)})
                  </p>
                  <p className="mt-1 font-mono text-foreground">{record.proposedTitle}</p>
                  {record.proposedLines.map((line, i) => (
                    <p key={i} className="text-muted">
                      {line}
                    </p>
                  ))}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">Matching</p>
                  <p className="mt-1 text-muted">{record.matchNote}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ConfirmButton
                action={approveStagingRecordAction.bind(null, record.id)}
                label="Approve"
                confirmLabel="Approve?"
                className="border-positive/40 text-positive hover:border-positive hover:text-positive"
              />
              <ConfirmButton action={rejectStagingRecordAction.bind(null, record.id)} label="Reject" confirmLabel="Reject?" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="font-mono text-foreground">
                {record.completeness.receivedCount} / {record.completeness.totalFields} fields received
              </span>
              <span className="text-positive">🟢 {record.completeness.receivedCount} Received</span>
              <span className="text-negative">🔴 {record.completeness.missingCount} Missing</span>
              {record.completeness.needsReviewCount > 0 ? (
                <span className="text-warning">🟠 {record.completeness.needsReviewCount} Needs Review</span>
              ) : null}
              {record.hasPossibleDuplicate ? <span className="text-warning">🟠 Possible Duplicate</span> : null}
            </div>
            <button
              type="button"
              onClick={() => setDetailsRecordId(record.id)}
              className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              View Data Details
            </button>
          </div>
        </div>
      ))}

      {detailsRecord ? (
        <TransactionDataDetailsDialog
          title={detailsRecord.proposedTitle}
          sourceKey={detailsRecord.sourceKey}
          completeness={detailsRecord.completeness}
          matchNote={detailsRecord.matchNote}
          onClose={() => setDetailsRecordId(null)}
        />
      ) : null}
    </div>
  );
}
