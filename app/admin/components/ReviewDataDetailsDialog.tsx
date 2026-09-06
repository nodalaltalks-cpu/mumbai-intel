"use client";

import { useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import Badge from "@/app/components/ui/Badge";
import type { ReviewCompleteness, ReviewField } from "@/lib/ingestion/reviewFieldRegistry";
import { buildEnrichmentConflicts, buildFounderReviewSummary, type FounderReviewField } from "@/lib/ingestion/founderReviewFields";

const STATUS_BADGE: Record<ReviewField["status"], { tone: "positive" | "negative" | "warning"; label: string; icon: string }> = {
  RECEIVED: { tone: "positive", label: "Received", icon: "🟢" },
  MISSING: { tone: "negative", label: "Missing", icon: "🔴" },
  NEEDS_REVIEW: { tone: "warning", label: "Needs Review", icon: "🟠" },
};

/** A single description-length value gets a collapse toggle; short values never do. */
function FieldValue({ field }: { field: ReviewField }) {
  const [expanded, setExpanded] = useState(false);
  if (field.status === "MISSING") {
    return <p className="text-[11px] text-muted">To be filled</p>;
  }
  const value = field.value ?? "";
  const isLong = value.length > 140;
  return (
    <div>
      <p className={`text-xs text-foreground ${isLong && !expanded ? "line-clamp-2" : ""}`}>{value}</p>
      {isLong ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-0.5 text-[10px] font-mono uppercase text-accent hover:underline">
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
      {field.reviewNote ? <p className="mt-0.5 text-[10px] text-warning">{field.reviewNote}</p> : null}
    </div>
  );
}

/** The unmodified original full-ingestion breakdown -- every group, every field, exactly as this dialog has always rendered it. Collapsed behind a <details> for a Project record (Phase 71B: still reachable, just no longer the primary founder experience); rendered open/top-level for every non-Project entity type, unchanged. */
function FullIngestionBreakdown({ completeness }: { completeness: ReviewCompleteness }) {
  const missingFields = completeness.groups.flatMap((g) => g.fields.filter((f) => f.status === "MISSING"));
  return (
    <div className="flex flex-col gap-4">
      {missingFields.length > 0 ? (
        <div className="rounded-sm border border-negative/30 bg-negative/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-negative">Needs attention — {missingFields.length} field(s)</p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {missingFields.map((f) => (
              <li key={f.key} className="text-[11px] text-muted">
                🔴 {f.label} — To be filled
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {completeness.groups.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">{group.label}</p>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {group.fields.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{f.label}</span>
                    <Badge tone={STATUS_BADGE[f.status].tone}>
                      {STATUS_BADGE[f.status].icon} {STATUS_BADGE[f.status].label}
                    </Badge>
                  </div>
                  <div className="mt-1">
                    <FieldValue field={f} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FounderReceivedRow({ field }: { field: FounderReviewField }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-[11px] text-muted">{field.label}</span>
      <span className="max-w-[60%] text-right text-xs text-foreground">{field.value}</span>
    </div>
  );
}

export default function ReviewDataDetailsDialog({
  title,
  sourceKey,
  completeness,
  isProject,
  enrichmentOutstanding,
  onClose,
}: {
  title: string;
  sourceKey: string;
  completeness: ReviewCompleteness;
  /** Phase 71B — gates the founder-facing (15-field) presentation. False/absent for Builder/Locality/Transaction/InfraAsset records, which keep the original, unfiltered dialog exactly as before. */
  isProject?: boolean;
  /** Phase 71B — the persisted enrichment run's fieldKey -> classification map (see lib/enrichment/enrichmentSummary.ts). Undefined/null for a non-Project record or a record enrichment has never run for. */
  enrichmentOutstanding?: Record<string, "GREEN_NEW" | "YELLOW" | "CONFLICT"> | null;
  onClose: () => void;
}) {
  const founderSummary = isProject ? buildFounderReviewSummary(completeness) : null;

  if (!founderSummary) {
    // Non-Project entity types (Builder/Locality/Transaction/InfraAsset) --
    // unchanged from before Phase 71B, which is scoped to Project review only.
    return (
      <Dialog title={title} onClose={onClose} maxWidth="max-w-2xl">
        <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="rounded-sm border border-border bg-surface-raised p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-muted">Data completeness</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {completeness.receivedCount} / {completeness.totalFields} fields received
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-positive transition-[width]"
                style={{ width: `${completeness.totalFields > 0 ? (completeness.receivedCount / completeness.totalFields) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <span className="text-positive">🟢 {completeness.receivedCount} Received</span>
              <span className="text-negative">🔴 {completeness.missingCount} Missing</span>
              {completeness.needsReviewCount > 0 ? <span className="text-warning">🟠 {completeness.needsReviewCount} Needs Review</span> : null}
            </div>
            <p className="mt-2 text-[10px] text-muted">Source batch: {sourceKey}</p>
          </div>
          <FullIngestionBreakdown completeness={completeness} />
        </div>
      </Dialog>
    );
  }

  const conflicts = buildEnrichmentConflicts(completeness, enrichmentOutstanding);
  const received = founderSummary.fields.filter((f) => f.status === "RECEIVED");
  const outstanding = founderSummary.fields.filter((f) => f.status !== "RECEIVED");
  const founderPct = founderSummary.totalFields > 0 ? (founderSummary.receivedCount / founderSummary.totalFields) * 100 : 0;

  return (
    <Dialog title={title} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="rounded-sm border border-border bg-surface-raised p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted">Founder review data</p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {founderSummary.receivedCount} / {founderSummary.totalFields} relevant fields received
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
            <div className="h-full rounded-full bg-positive transition-[width]" style={{ width: `${founderPct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            <span className="text-positive">🟢 {founderSummary.receivedCount} Received</span>
            <span className="text-negative">🔴 {founderSummary.missingCount} Missing</span>
            {founderSummary.needsReviewCount > 0 ? <span className="text-warning">🟠 {founderSummary.needsReviewCount} Needs Review</span> : null}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            {completeness.receivedCount} / {completeness.totalFields} ingestion fields received · Source batch: {sourceKey}
          </p>
        </div>

        <div className={`rounded-sm border p-3 ${conflicts.length > 0 ? "border-negative/40 bg-negative/5" : "border-positive/30 bg-positive/5"}`}>
          <p className={`text-[10px] uppercase tracking-wide ${conflicts.length > 0 ? "text-negative" : "text-positive"}`}>
            {conflicts.length > 0 ? `Conflicts — ${conflicts.length}` : "No conflicts"}
          </p>
          {conflicts.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-3">
              {conflicts.map((c) => (
                <li key={c.key} className="text-[11px]">
                  <p className="font-mono text-xs font-semibold text-foreground">{c.label}</p>
                  <p className="mt-0.5 text-muted">
                    Existing: <span className="text-foreground">{c.existingValue ?? "—"}</span>
                  </p>
                  <p className="text-muted italic">Proposed value &amp; source: run Enrich Project to view current details</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">Received data</p>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {received.length > 0 ? (
              received.map((f) => <FounderReceivedRow key={f.key} field={f} />)
            ) : (
              <p className="px-3 py-2 text-[11px] text-muted">Nothing received yet.</p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">Missing / needs review</p>
          {outstanding.length === 0 ? (
            <p className="text-[11px] text-positive">✓ Nothing outstanding</p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-sm border border-border p-3">
              {outstanding.map((f) =>
                f.status === "MISSING" ? (
                  <li key={f.key} className="text-[11px] text-muted">
                    {f.label} — Missing
                  </li>
                ) : (
                  <li key={f.key} className="text-[11px] text-warning">
                    {f.label} — Needs Review{f.reviewNote ? `: ${f.reviewNote}` : ""}
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        <details className="rounded-sm border border-border">
          <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-wide text-muted hover:text-accent">
            Show full ingestion data ({completeness.totalFields} fields)
          </summary>
          <div className="border-t border-border p-3">
            <FullIngestionBreakdown completeness={completeness} />
          </div>
        </details>
      </div>
    </Dialog>
  );
}
