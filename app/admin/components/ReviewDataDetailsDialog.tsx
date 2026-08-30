"use client";

import { useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import Badge from "@/app/components/ui/Badge";
import type { ReviewCompleteness, ReviewField } from "@/lib/ingestion/reviewFieldRegistry";

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

export default function ReviewDataDetailsDialog({
  title,
  sourceKey,
  completeness,
  onClose,
}: {
  title: string;
  sourceKey: string;
  completeness: ReviewCompleteness;
  onClose: () => void;
}) {
  const missingFields = completeness.groups.flatMap((g) => g.fields.filter((f) => f.status === "MISSING"));

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

        <div className="flex flex-col gap-4">
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
      </div>
    </Dialog>
  );
}
