"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  markUnderReviewAction,
  acceptReportAction,
  rejectReportAction,
  resolveReportAction,
  deleteReportAction,
  getReportHistoryAction,
} from "@/lib/actions/reports";
import { formatDateTime } from "@/lib/format";
import type { ReportRow } from "@/lib/analytics/report-queries";
import Dialog from "@/app/components/ui/Dialog";
import AuditHistory from "./AuditHistory";

type HistoryLog = Awaited<ReturnType<typeof getReportHistoryAction>>[number];

const STATUS_CLASS: Record<string, string> = {
  NEW: "border-negative/40 bg-negative/10 text-negative",
  UNDER_REVIEW: "border-accent/40 bg-accent/10 text-accent",
  ACCEPTED: "border-positive/40 bg-positive/10 text-positive",
  REJECTED: "border-border bg-surface-raised text-muted",
  RESOLVED: "border-border bg-surface-raised text-muted",
};

const CATEGORY_LABEL: Record<string, string> = {
  PROJECT_DETAILS: "Project details",
  PRICING: "Pricing",
  CONFIGURATION: "Configuration",
  LOCATION: "Location",
  CONSTRUCTION: "Construction / possession",
  AMENITIES: "Amenities",
  BUILDER: "Builder information",
  TRANSACTION: "Transaction information",
  OTHER: "Other",
};

function editHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === "Project") return `/admin/projects/${entityId}/edit`;
  if (entityType === "Builder") return `/admin/builders/${entityId}/edit`;
  if (entityType === "Locality") return `/admin/localities/${entityId}/edit`;
  return null;
}

export default function ReportQueueList({ reports, canDelete = false }: { reports: ReportRow[]; canDelete?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyByReport, setHistoryByReport] = useState<Record<string, HistoryLog[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [rejectingReport, setRejectingReport] = useState<{ id: string; entityName: string } | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ error?: string }>, id: string) {
    startTransition(async () => {
      const result = await action(id);
      if (result.error) {
        // eslint-disable-next-line no-alert
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function submitRejection() {
    if (!rejectingReport) return;
    const remark = rejectRemark.trim();
    if (!remark) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setRejectError(null);
    startTransition(async () => {
      const result = await rejectReportAction(rejectingReport.id, remark);
      if (result.error) {
        setRejectError(result.error);
        return;
      }
      setRejectingReport(null);
      setRejectRemark("");
      router.refresh();
    });
  }

  function runDelete(id: string, entityName: string) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the report on "${entityName}"?\n\nThis report will be permanently deleted and cannot be recovered. Continue?`)) return;
    run(deleteReportAction, id);
  }

  function toggleHistory(reportId: string) {
    if (openHistoryId === reportId) {
      setOpenHistoryId(null);
      return;
    }
    setOpenHistoryId(reportId);
    if (!historyByReport[reportId]) {
      setHistoryLoading(reportId);
      getReportHistoryAction(reportId)
        .then((logs) => setHistoryByReport((prev) => ({ ...prev, [reportId]: logs })))
        .finally(() => setHistoryLoading(null));
    }
  }

  if (reports.length === 0) {
    return <p className="text-xs text-muted">Nothing here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => {
        const href = editHref(report.entityType, report.entityId);
        return (
          <div key={report.id} className="rounded-sm border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[report.status]}`}>
                    {report.status.replace("_", " ")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {report.entityType}
                    {report.category ? ` · ${CATEGORY_LABEL[report.category] ?? report.category}` : ""}
                  </span>
                  <span className="text-[10px] text-muted">{formatDateTime(report.createdAt)}</span>
                </div>
                {href ? (
                  <Link href={href} className="mt-1 block font-mono text-sm font-semibold text-foreground hover:text-accent">
                    {report.entityName}
                  </Link>
                ) : (
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">{report.entityName}</p>
                )}
                <p className="mt-2 text-xs text-foreground">{report.issue}</p>
                {report.suggestedValue ? (
                  <p className="mt-1 text-xs text-muted">
                    <span className="text-accent">Suggested:</span> {report.suggestedValue}
                  </p>
                ) : null}
                {report.reporterEmail ? <p className="mt-1 text-[10px] text-muted">Reported by {report.reporterEmail}</p> : null}
                {report.status === "REJECTED" && report.resolutionNote ? (
                  <p className="mt-1.5 text-xs text-muted">
                    <span className="text-negative">Rejection reason sent to user:</span> {report.resolutionNote}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                {report.status === "NEW" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(markUnderReviewAction, report.id)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
                  >
                    Mark under review
                  </button>
                ) : null}
                {report.status !== "ACCEPTED" && report.status !== "RESOLVED" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(acceptReportAction, report.id)}
                    className="rounded-sm border border-positive/40 bg-positive/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-positive hover:bg-positive/20 disabled:opacity-60"
                  >
                    Accept
                  </button>
                ) : null}
                {report.status !== "REJECTED" && report.status !== "RESOLVED" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setRejectingReport({ id: report.id, entityName: report.entityName });
                      setRejectRemark("");
                      setRejectError(null);
                    }}
                    className="rounded-sm border border-negative/40 bg-negative/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-negative hover:bg-negative/20 disabled:opacity-60"
                  >
                    Reject
                  </button>
                ) : null}
                {report.status === "ACCEPTED" && href ? (
                  <>
                    <Link
                      href={href}
                      className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      Open project
                    </Link>
                    <Link
                      href={`${href}?reportId=${report.id}`}
                      className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
                    >
                      Edit reported information →
                    </Link>
                  </>
                ) : null}
                {report.status === "ACCEPTED" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(resolveReportAction, report.id)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
                  >
                    Mark resolved
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleHistory(report.id)}
                  className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                >
                  {openHistoryId === report.id ? "Hide history" : "History"}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => runDelete(report.id, report.entityName)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative disabled:opacity-60"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            {openHistoryId === report.id ? (
              <div className="mt-3 border-t border-border pt-3">
                {historyLoading === report.id ? (
                  <p className="text-xs text-muted">Loading history…</p>
                ) : (
                  <AuditHistory logs={historyByReport[report.id] ?? []} />
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {rejectingReport ? (
        <Dialog
          title={`Reject report — ${rejectingReport.entityName}`}
          onClose={() => {
            setRejectingReport(null);
            setRejectRemark("");
            setRejectError(null);
          }}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectingReport(null);
                  setRejectRemark("");
                  setRejectError(null);
                }}
                className="rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={submitRejection}
                className="rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs font-mono uppercase tracking-wide text-negative hover:bg-negative/20 disabled:opacity-60"
              >
                {isPending ? "Sending…" : "Reject & Send Remark"}
              </button>
            </div>
          }
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Rejection reason</span>
            <p className="text-[11px] text-muted">The reporter will see this explanation — keep it clear and specific. This field is required.</p>
            <textarea
              autoFocus
              value={rejectRemark}
              onChange={(e) => setRejectRemark(e.target.value)}
              rows={4}
              placeholder="e.g. We checked MahaRERA and the current possession date shown is correct."
              className="w-full resize-none rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>
          {rejectError ? <p className="mt-2 text-xs text-negative">{rejectError}</p> : null}
        </Dialog>
      ) : null}
    </div>
  );
}
