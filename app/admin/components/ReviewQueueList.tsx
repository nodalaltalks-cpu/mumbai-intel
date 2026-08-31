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
import type { ReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ApprovalReadinessResult } from "@/lib/ingestion/projectApprovalReadiness";
import {
  acceptEnrichmentFieldAction,
  acceptEntityMatchAction,
  enrichProjectAction,
  getEnrichmentFieldHistoryAction,
  revertEnrichmentFieldAction,
  type EnrichProjectResult,
} from "@/lib/actions/enrichment";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import type { EnrichmentBadgeInfo } from "@/lib/enrichment/enrichmentSummary";
import ConfirmButton from "./ConfirmButton";
import ReviewDataDetailsDialog from "./ReviewDataDetailsDialog";
import EnrichmentDialog from "./EnrichmentDialog";

export interface ReviewRecord {
  id: string;
  createdAt: string;
  sourceKey: string;
  proposedLabel: string;
  proposedTitle: string;
  proposedLines: string[];
  matchLabel: string | null;
  matchTitle: string | null;
  matchLines: string[];
  noMatchNote: string | null;
  /** Full field-by-field completeness breakdown (Phase 14C) -- null only for an entityType this hasn't been built for yet; never partially fabricated. */
  completeness: ReviewCompleteness | null;
  /** Phase 29 Part A — gates the "Enrich Project" button to Project records only. */
  isProject: boolean;
  /** Phase 34 Part F — Project-only approval-readiness verdict, derived from `completeness`; null for every non-Project record. */
  readiness: ApprovalReadinessResult | null;
  /** Phase 46 Part E — the last persisted enrichment run's at-a-glance status, read straight off the staging payload (no live fetch). Null for every non-Project record. */
  enrichmentBadge: EnrichmentBadgeInfo | null;
}

type EnrichmentFilter = "ALL" | "PENDING" | "CONFLICTS" | "NOT_ENRICHED";

function matchesEnrichmentFilter(record: ReviewRecord, filter: EnrichmentFilter): boolean {
  if (filter === "ALL") return true;
  const badge = record.enrichmentBadge;
  if (!badge) return false;
  if (filter === "PENDING") return badge.status === "READY" && badge.proposedCount > 0;
  if (filter === "CONFLICTS") return badge.conflictCount > 0;
  return badge.status === "NOT_RUN"; // NOT_ENRICHED
}

/** Phase 46 Part E -- the compact per-row summary. Reuses this codebase's existing plain colored-text convention (see the 🟢/🔴/🟠 completeness line just below it) rather than introducing a new visual pattern. */
function EnrichmentBadgeLine({ badge }: { badge: EnrichmentBadgeInfo }) {
  if (badge.status === "NOT_RUN") return <span className="text-[11px] text-muted">— Not run</span>;
  if (badge.status === "NO_SOURCE") return <span className="text-[11px] text-muted">— No official source found</span>;
  if (badge.status === "SOURCE_UNAVAILABLE") return <span className="text-[11px] text-warning">⚠ Source unavailable</span>;
  if (badge.status === "ERROR") return <span className="text-[11px] text-negative">⚠ Enrichment error</span>;
  if (badge.status === "NO_NEW_INFO") return <span className="text-[11px] text-muted">✓ No new information</span>;
  // READY
  if (badge.proposedCount === 0) return <span className="text-[11px] text-positive">✓ Reviewed</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-accent">● {badge.proposedCount} proposed</span>
      {badge.conflictCount > 0 ? <span className="text-negative">● {badge.conflictCount} conflict{badge.conflictCount === 1 ? "" : "s"}</span> : null}
    </span>
  );
}

interface EnrichmentViewState {
  loading: boolean;
  result: EnrichProjectResult | null;
}

export default function ReviewQueueList({ records }: { records: ReviewRecord[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [detailsRecordId, setDetailsRecordId] = useState<string | null>(null);
  const detailsRecord = records.find((r) => r.id === detailsRecordId) ?? null;

  const [enrichmentRecordId, setEnrichmentRecordId] = useState<string | null>(null);
  const [enrichmentByRecordId, setEnrichmentByRecordId] = useState<Record<string, EnrichmentViewState>>({});
  const enrichmentRecord = records.find((r) => r.id === enrichmentRecordId) ?? null;
  const enrichmentState = enrichmentRecordId ? enrichmentByRecordId[enrichmentRecordId] : null;

  // Phase 46 Part F -- a very small filter over the already-loaded records,
  // client-side only (no new fetch/query, no data-grid infrastructure).
  const [enrichmentFilter, setEnrichmentFilter] = useState<EnrichmentFilter>("ALL");
  const visibleRecords = records.filter((r) => matchesEnrichmentFilter(r, enrichmentFilter));

  function runEnrichment(recordId: string) {
    setEnrichmentRecordId(recordId);
    setEnrichmentByRecordId((prev) => ({ ...prev, [recordId]: { loading: true, result: null } }));
    startTransition(async () => {
      const result = await enrichProjectAction(recordId);
      setEnrichmentByRecordId((prev) => ({ ...prev, [recordId]: { loading: false, result } }));
      // Phase 46 Part E/J -- the run just persisted a fresh enrichmentSummary
      // onto this record; refresh so the row's badge reflects it immediately.
      router.refresh();
    });
  }

  async function handleAcceptField(field: EnrichmentField): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await acceptEnrichmentFieldAction(enrichmentRecordId, field.key, field.proposedValue ?? "", field.proposedItems, {
      currentDisplayValue: field.currentValue,
      sourceUrl: field.sourceUrl,
      sourceType: field.sourceType,
      confidence: field.confidence,
    });
    if (result.status === "SUCCESS") {
      router.refresh(); // re-derives the completeness counter/badges from the freshly persisted staging payload
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not save this field." };
  }

  async function handleAcceptEntityMatch(kind: "builder" | "locality", existingId: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await acceptEntityMatchAction(enrichmentRecordId, kind, existingId);
    if (result.status === "SUCCESS") {
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? `Could not save this ${kind}.` };
  }

  async function handleViewHistory(fieldKey: string): Promise<EnrichmentHistoryEntry[]> {
    if (!enrichmentRecordId) return [];
    return getEnrichmentFieldHistoryAction(enrichmentRecordId, fieldKey);
  }

  async function handleUndo(fieldKey: string, historyEventId: string): Promise<{ ok: boolean; error?: string }> {
    if (!enrichmentRecordId) return { ok: false, error: "No record open." };
    const result = await revertEnrichmentFieldAction(enrichmentRecordId, fieldKey, historyEventId);
    if (result.status === "SUCCESS") {
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "Could not undo this field." };
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    // Scoped to the currently VISIBLE (filtered) records -- selecting "all"
    // while a filter narrows the list must never silently select a hidden row.
    setSelected((prev) => (prev.size === visibleRecords.length ? new Set() : new Set(visibleRecords.map((r) => r.id))));
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
          <input type="checkbox" checked={selected.size === visibleRecords.length && visibleRecords.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
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

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["ALL", "All"],
            ["PENDING", "Enrichment pending"],
            ["CONFLICTS", "Conflicts"],
            ["NOT_ENRICHED", "Not enriched"],
          ] as [EnrichmentFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setEnrichmentFilter(value)}
            className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${
              enrichmentFilter === value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {label}
          </button>
        ))}
        {enrichmentFilter !== "ALL" ? (
          <span className="text-[11px] text-muted">
            {visibleRecords.length} of {records.length}
          </span>
        ) : null}
      </div>

      {visibleRecords.length === 0 ? (
        <p className="rounded-sm border border-border p-4 text-xs text-muted">No records match this filter.</p>
      ) : null}

      {visibleRecords.map((record) => (
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
                    {record.proposedLabel} (from {record.sourceKey} · {formatDate(record.createdAt)})
                  </p>
                  <p className="mt-1 font-mono text-foreground">{record.proposedTitle}</p>
                  {record.proposedLines.map((line, i) => (
                    <p key={i} className="text-muted">
                      {line}
                    </p>
                  ))}
                  {record.enrichmentBadge ? (
                    <div className="mt-1">
                      <EnrichmentBadgeLine badge={record.enrichmentBadge} />
                    </div>
                  ) : null}
                </div>

                {record.matchTitle ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">{record.matchLabel}</p>
                    <p className="mt-1 font-mono text-foreground">{record.matchTitle}</p>
                    {record.matchLines.map((line, i) => (
                      <p key={i} className="text-muted">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted">No existing match found</p>
                    <p className="mt-1 text-muted">{record.noMatchNote}</p>
                  </div>
                )}
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
              {record.isProject ? (
                <button
                  type="button"
                  onClick={() => runEnrichment(record.id)}
                  className="rounded-sm border border-accent/40 px-2 py-1 text-[11px] font-mono uppercase text-accent hover:bg-accent/10"
                >
                  Enrich Project
                </button>
              ) : null}
            </div>
          </div>

          {record.completeness ? (
            <div className="mt-3 border-t border-border pt-3">
              {record.isProject && record.readiness ? (
                <button
                  type="button"
                  onClick={() => setDetailsRecordId(record.id)}
                  className="mb-2 flex w-full flex-col items-start gap-1 rounded-sm border border-border p-2 text-left hover:border-accent"
                >
                  {record.readiness.status === "READY" ? (
                    <span className="text-[11px] text-positive">✓ Approval Ready</span>
                  ) : (
                    <span className="text-[11px] text-warning">⚠ {record.readiness.neededFieldLabels.length} field(s) need attention</span>
                  )}
                  {record.readiness.missingFieldLabels.length > 0 ? (
                    <span className="text-[10px] text-muted">
                      Missing: {record.readiness.missingFieldLabels.slice(0, 3).join(", ")}
                      {record.readiness.missingFieldLabels.length > 3 ? `, +${record.readiness.missingFieldLabels.length - 3} more` : ""}
                    </span>
                  ) : null}
                </button>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="font-mono text-foreground">
                    {record.completeness.receivedCount} / {record.completeness.totalFields} fields received
                  </span>
                  <span className="text-positive">🟢 {record.completeness.receivedCount} Received</span>
                  <span className="text-negative">🔴 {record.completeness.missingCount} Missing</span>
                  {record.completeness.needsReviewCount > 0 ? (
                    <span className="text-warning">🟠 {record.completeness.needsReviewCount} Needs Review</span>
                  ) : null}
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
          ) : null}
        </div>
      ))}

      {detailsRecord?.completeness ? (
        <ReviewDataDetailsDialog
          title={detailsRecord.proposedTitle}
          sourceKey={detailsRecord.sourceKey}
          completeness={detailsRecord.completeness}
          onClose={() => setDetailsRecordId(null)}
        />
      ) : null}

      {enrichmentRecord && enrichmentState ? (
        <EnrichmentDialog
          title={enrichmentRecord.proposedTitle}
          loading={enrichmentState.loading}
          status={enrichmentState.result?.status ?? null}
          fields={enrichmentState.result?.fields ?? null}
          builderMatch={enrichmentState.result?.builderMatch}
          localityMatch={enrichmentState.result?.localityMatch}
          error={enrichmentState.result?.error ?? null}
          onClose={() => setEnrichmentRecordId(null)}
          onRetry={() => runEnrichment(enrichmentRecord.id)}
          onAcceptField={handleAcceptField}
          onAcceptEntityMatch={handleAcceptEntityMatch}
          onViewHistory={handleViewHistory}
          onUndo={handleUndo}
        />
      ) : null}
    </div>
  );
}
