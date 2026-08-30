"use client";

import { useState } from "react";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import type { EnrichmentClassification, EnrichmentField } from "@/lib/enrichment/types";
import { SOURCE_TIER_LABEL } from "@/lib/enrichment/types";

const CLASSIFICATION_BADGE: Record<EnrichmentClassification, { tone: BadgeTone; label: string; icon: string }> = {
  CONFIRMED: { tone: "positive", label: "Confirmed", icon: "🟢" },
  GREEN_NEW: { tone: "positive", label: "New — Safe to Add", icon: "🟢" },
  YELLOW: { tone: "warning", label: "Needs Review", icon: "🟠" },
  CONFLICT: { tone: "negative", label: "Conflict", icon: "🔴" },
  MISSING: { tone: "muted", label: "Missing", icon: "⚪" },
};

type FieldSaveState = "idle" | "saving" | "saved" | "error" | "kept";

/**
 * Project Enrichment proposal table (Phase 28 Part I, field-level actions
 * added Phase 29 Part E, PERSISTED as of Phase 32 Part E).
 *
 * Accept/Review/Accept Proposed now call `onAcceptField`, which the parent
 * (ReviewQueueList.tsx) wires to `acceptEnrichmentFieldAction` -- this SAVES
 * the accepted value into the existing PENDING staging record's payload.
 * "Keep Current" for a CONFLICT field stays a pure client-side
 * acknowledgment -- nothing changes, so nothing is sent to the server.
 *
 * This never touches the live Project and never approves/rejects the
 * staging record -- that remains the Review Queue's own separate Approve
 * button. Confirmation copy is deliberately "Saved to pending review", never
 * "Project updated" (Phase 32 Part P).
 */
export default function EnrichmentProposalPanel({
  fields,
  onAcceptField,
}: {
  fields: EnrichmentField[];
  onAcceptField: (field: EnrichmentField) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [saveState, setSaveState] = useState<Record<string, FieldSaveState>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  const byGroup = new Map<string, EnrichmentField[]>();
  for (const field of fields) {
    const group = byGroup.get(field.group) ?? [];
    group.push(field);
    byGroup.set(field.group, group);
  }

  const counts = fields.reduce(
    (acc, f) => {
      acc[f.classification] += 1;
      return acc;
    },
    { CONFIRMED: 0, GREEN_NEW: 0, YELLOW: 0, CONFLICT: 0, MISSING: 0 } as Record<EnrichmentClassification, number>
  );

  async function handleAccept(field: EnrichmentField) {
    setSaveState((prev) => ({ ...prev, [field.key]: "saving" }));
    const result = await onAcceptField(field);
    if (result.ok) {
      setSaveState((prev) => ({ ...prev, [field.key]: "saved" }));
    } else {
      setSaveState((prev) => ({ ...prev, [field.key]: "error" }));
      setSaveError((prev) => ({ ...prev, [field.key]: result.error ?? "Could not save this field." }));
    }
  }

  function handleKeepCurrent(fieldKey: string) {
    setSaveState((prev) => ({ ...prev, [fieldKey]: "kept" }));
  }

  function statusLine(fieldKey: string) {
    const state = saveState[fieldKey];
    if (state === "saving") return <span className="text-[10px] text-muted">Saving...</span>;
    if (state === "saved") return <span className="text-[10px] text-positive">✓ Saved to pending review</span>;
    if (state === "kept") return <span className="text-[10px] text-muted">Keeping current value — no change made</span>;
    if (state === "error") return <span className="text-[10px] text-negative">{saveError[fieldKey]}</span>;
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="text-positive">🟢 {counts.CONFIRMED} Confirmed</span>
        <span className="text-positive">🟢 {counts.GREEN_NEW} New (Safe)</span>
        <span className="text-warning">🟠 {counts.YELLOW} Needs Review</span>
        <span className="text-negative">🔴 {counts.CONFLICT} Conflict</span>
        <span className="text-muted">⚪ {counts.MISSING} Missing</span>
      </div>

      <p className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-[10px] text-muted">
        Accepting a field saves it to this project&apos;s pending review record only — the live project listing is unaffected until you use the Review
        Queue&apos;s own Approve button.
      </p>

      {[...byGroup.entries()].map(([group, groupFields]) => (
        <div key={group}>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">{group}</p>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {groupFields.map((field) => {
              const state = saveState[field.key] ?? "idle";
              const busy = state === "saving";
              const done = state === "saved" || state === "kept";
              return (
                <div key={field.key} className="flex flex-col gap-1 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted">{field.label}</span>
                    <Badge tone={CLASSIFICATION_BADGE[field.classification].tone}>
                      {CLASSIFICATION_BADGE[field.classification].icon} {CLASSIFICATION_BADGE[field.classification].label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted">Current</p>
                      <p className="text-foreground">{field.currentValue ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted">Proposed</p>
                      <p className="text-foreground">{field.proposedValue ?? "—"}</p>
                    </div>
                  </div>
                  {field.sourceUrl ? (
                    <p className="text-[10px] text-muted">
                      Source: {field.sourceType ? SOURCE_TIER_LABEL[field.sourceType] : "Unknown"} · {field.sourceUrl}
                      {field.confidence ? ` · Confidence: ${field.confidence}` : ""}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-muted">{field.reason}</p>

                  {field.classification === "GREEN_NEW" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      {statusLine(field.key)}
                    </div>
                  ) : null}

                  {field.classification === "YELLOW" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-warning/40 px-2 py-0.5 text-[10px] font-mono uppercase text-warning hover:bg-warning/10 disabled:opacity-50"
                        title="This value is source-backed but lower confidence -- you're accepting it despite that."
                      >
                        Accept (lower confidence)
                      </button>
                      {statusLine(field.key)}
                    </div>
                  ) : null}

                  {field.classification === "CONFLICT" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleKeepCurrent(field.key)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
                      >
                        Keep Current
                      </button>
                      <button
                        type="button"
                        disabled={busy || done}
                        onClick={() => handleAccept(field)}
                        className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
                      >
                        Accept Proposed
                      </button>
                      {statusLine(field.key)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
