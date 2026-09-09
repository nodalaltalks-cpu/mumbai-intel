"use client";

import Dialog from "@/app/components/ui/Dialog";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { ReviewCompleteness } from "@/lib/ingestion/reviewFieldRegistry";
import type { ProjectResearchActivity, ResearchFieldStatus } from "@/lib/enrichment/researchAttribution";

/**
 * Founder Review Queue — Search + Agent Change Visibility, Part 4/6.
 *
 * A READ-ONLY audit view over `ProjectResearchActivity` (itself a pure
 * correlation over the EXISTING AuditLog rows -- see
 * lib/enrichment/researchAttribution.ts's own doc comment). No mutation of
 * any kind lives here: the founder still uses the existing Enrich/Research
 * dialogs' Accept/Edit/Reject controls for that. This is deliberately its
 * own small dialog rather than a mode bolted onto ReviewDataDetailsDialog --
 * that dialog's "Received/Missing" framing has no concept of research
 * provenance at all, and retrofitting it would touch far more of its
 * existing, already-working layout than adding a new read-only view does.
 */

const STATUS_BADGE: Record<ResearchFieldStatus, { tone: BadgeTone; label: string; icon: string }> = {
  ACCEPTED: { tone: "positive", label: "Accepted", icon: "✓" },
  FOUNDER_EDITED: { tone: "positive", label: "Founder Edited", icon: "✎" },
  REJECTED: { tone: "negative", label: "Rejected", icon: "✕" },
  CONFLICT: { tone: "warning", label: "Conflict", icon: "⚠" },
  PENDING: { tone: "muted", label: "Pending Review", icon: "…" },
};

function fieldLabel(completeness: ReviewCompleteness | null, key: string): string {
  const found = completeness?.groups.flatMap((g) => g.fields).find((f) => f.key === key);
  return found?.label ?? key;
}

export default function ResearchChangesDialog({
  title,
  activity,
  completeness,
  onClose,
}: {
  title: string;
  activity: ProjectResearchActivity;
  completeness: ReviewCompleteness | null;
  onClose: () => void;
}) {
  return (
    <Dialog title={`Research Changes — ${title}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="rounded-sm border border-border bg-surface-raised p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            🤖 {activity.providerLabel}
            {activity.lastResearchAt ? ` · ${formatDateTime(activity.lastResearchAt)}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="font-mono text-foreground">
              {activity.passedVerification} finding{activity.passedVerification === 1 ? "" : "s"}
            </span>
            {activity.accepted > 0 ? <span className="text-positive">✓ {activity.accepted} accepted</span> : null}
            {activity.founderEdited > 0 ? <span className="text-positive">✎ {activity.founderEdited} founder edited</span> : null}
            {activity.conflicts > 0 ? <span className="text-warning">⚠ {activity.conflicts} conflict{activity.conflicts === 1 ? "" : "s"}</span> : null}
            {activity.rejected > 0 ? <span className="text-negative">✕ {activity.rejected} rejected</span> : null}
            {activity.pending > 0 ? <span className="text-muted">… {activity.pending} pending review</span> : null}
          </div>
          {activity.rejectedByVerification > 0 ? (
            <p className="mt-1.5 text-[10px] text-muted">
              {activity.rejectedByVerification} additional finding{activity.rejectedByVerification === 1 ? "" : "s"} failed identity/scope verification and never reached review.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {activity.fields.map((f) => {
            const badge = STATUS_BADGE[f.status];
            const founderValue = f.decision?.displayValue ?? null;
            const showFounderValue = f.status === "FOUNDER_EDITED" && founderValue !== null && founderValue !== f.proposedValue;
            return (
              <div key={f.fieldKey} className="rounded-sm border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{fieldLabel(completeness, f.fieldKey)}</span>
                  <Badge tone={badge.tone}>
                    {badge.icon} {badge.label}
                  </Badge>
                </div>
                <p className="mt-1.5 break-words text-[11px] text-muted">
                  Research: <span className="text-foreground">{f.proposedValue ?? "—"}</span>
                </p>
                {showFounderValue ? (
                  <p className="break-words text-[11px] text-muted">
                    Founder value: <span className="text-foreground">{founderValue}</span>
                  </p>
                ) : null}
                {f.sourceUrl ? <p className="mt-1 break-all text-[10px] text-muted">Source: {f.sourceUrl}</p> : null}
                {f.decision?.reason ? <p className="mt-1 text-[10px] text-negative">Reason: {f.decision.reason}</p> : null}
                <p className="mt-1.5 text-[10px] text-muted">
                  Proposed {formatDateTime(f.proposedAt)}
                  {f.decidedAt ? ` · Decided ${formatDateTime(f.decidedAt)}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
