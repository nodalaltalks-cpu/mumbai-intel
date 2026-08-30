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

type FieldDecision = "accepted" | "reviewed" | "kept_current" | "accept_proposed";

const DECISION_LABEL: Record<FieldDecision, string> = {
  accepted: "Marked accepted (not yet saved)",
  reviewed: "Marked reviewed (not yet saved)",
  kept_current: "Marked: keep current (not yet saved)",
  accept_proposed: "Marked: accept proposed (not yet saved)",
};

/**
 * Project Enrichment proposal table (Phase 28 Part I, field-level actions
 * added Phase 29 Part E).
 *
 * The per-field Accept/Review/Keep Current/Accept Proposed buttons below are
 * LOCAL UI STATE ONLY -- clicking one does not write to the database, does
 * not change the Project row, and is not persisted anywhere (no caching/
 * storage mechanism was authorized this phase). They exist so a reviewer can
 * track their own in-progress decisions while reading through a project's
 * fields; the state resets the next time this dialog is opened. Applying any
 * of these decisions to the actual Project record, and approving the
 * project itself, are both explicitly out of scope for this phase and remain
 * a separate, already-existing action (the Review Queue's own Approve
 * button) -- enrichment must never substitute for that approval step.
 */
export default function EnrichmentProposalPanel({ fields }: { fields: EnrichmentField[] }) {
  const [decisions, setDecisions] = useState<Record<string, FieldDecision>>({});

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

  function setDecision(key: string, decision: FieldDecision) {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
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
        Field actions below only track your own review progress in this view — nothing is saved. Approving the project&apos;s data still happens from the
        Review Queue&apos;s own Approve button.
      </p>

      {[...byGroup.entries()].map(([group, groupFields]) => (
        <div key={group}>
          <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wide text-muted">{group}</p>
          <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
            {groupFields.map((field) => {
              const decision = decisions[field.key];
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
                        onClick={() => setDecision(field.key, "accepted")}
                        className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10"
                      >
                        Accept
                      </button>
                      {decision ? <span className="text-[10px] text-muted">{DECISION_LABEL[decision]}</span> : null}
                    </div>
                  ) : null}

                  {field.classification === "YELLOW" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDecision(field.key, "reviewed")}
                        className="rounded-sm border border-warning/40 px-2 py-0.5 text-[10px] font-mono uppercase text-warning hover:bg-warning/10"
                      >
                        Review
                      </button>
                      {decision ? <span className="text-[10px] text-muted">{DECISION_LABEL[decision]}</span> : null}
                    </div>
                  ) : null}

                  {field.classification === "CONFLICT" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDecision(field.key, "kept_current")}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground"
                      >
                        Keep Current
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecision(field.key, "accept_proposed")}
                        className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10"
                      >
                        Accept Proposed
                      </button>
                      {decision ? <span className="text-[10px] text-muted">{DECISION_LABEL[decision]}</span> : null}
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
