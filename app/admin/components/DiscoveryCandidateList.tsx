"use client";

import { useState } from "react";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import type { DiscoveryStatus, ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";

export interface DiscoveryCandidateRow {
  id: string;
  status: DiscoveryStatus;
  payload: ProjectDiscoveryCandidatePayload;
  matchedExistingName: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<DiscoveryStatus, BadgeTone> = {
  DISCOVERED: "muted",
  SOURCE_FOUND: "info",
  READY_FOR_ENRICHMENT: "positive",
  ENRICHED: "positive",
  NEEDS_REVIEW: "warning",
  REJECTED_DUPLICATE: "negative",
  EXCLUDED: "muted",
};

const DUPLICATE_TONE: Record<ProjectDiscoveryCandidatePayload["duplicateStatus"], BadgeTone> = {
  EXACT: "negative",
  CLEAR_ALIAS: "negative",
  AMBIGUOUS: "warning",
  NO_MATCH: "positive",
};

/**
 * Phase 39 Part I — the founder-facing discovery review list. Deliberately
 * NOT a rebuild of ReviewQueueList (which is Project/Builder/Locality/
 * Transaction/InfraAsset-specific and untouched by this phase) — a plain
 * table with three actions (Include / Exclude / Review), matching Part J's
 * "smallest system" instruction. Every action just relabels one staging
 * row's status via applyDiscoveryFounderAction; nothing here ever touches a
 * real Project.
 */
export default function DiscoveryCandidateList({
  rows,
  onAction,
}: {
  rows: DiscoveryCandidateRow[];
  onAction: (id: string, action: DiscoveryFounderAction) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localStatus, setLocalStatus] = useState<Record<string, DiscoveryStatus>>({});

  async function handleAction(id: string, action: DiscoveryFounderAction) {
    setBusyId(id);
    const result = await onAction(id, action);
    setBusyId(null);
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [id]: "" }));
      setLocalStatus((prev) => ({ ...prev, [id]: action === "EXCLUDE" ? "EXCLUDED" : action === "REVIEW" ? "NEEDS_REVIEW" : "READY_FOR_ENRICHMENT" }));
    } else {
      setErrors((prev) => ({ ...prev, [id]: result.error ?? "Could not update this candidate." }));
    }
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-raised text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 text-left">Project</th>
            <th className="px-3 py-2 text-left">Developer</th>
            <th className="px-3 py-2 text-left">Area</th>
            <th className="px-3 py-2 text-left">Discovery source</th>
            <th className="px-3 py-2 text-left">Official source</th>
            <th className="px-3 py-2 text-left">Confidence</th>
            <th className="px-3 py-2 text-left">Duplicate status</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = localStatus[row.id] ?? row.status;
            const busy = busyId === row.id;
            const p = row.payload;
            return (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 align-top text-foreground">{p.projectName}</td>
                <td className="px-3 py-2 align-top text-foreground">{p.developerName}</td>
                <td className="px-3 py-2 align-top text-muted">{p.areaName}</td>
                <td className="px-3 py-2 align-top text-muted">
                  {p.discoverySource}
                  <br />
                  <span className="text-[10px]">{formatDate(row.createdAt)}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  {p.officialSourceStatus === "IDENTIFIED" ? (
                    <a href={p.officialDeveloperUrl ?? undefined} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {p.officialDeveloperUrl}
                    </a>
                  ) : (
                    <Badge tone="warning">Official Source Unknown</Badge>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-muted">{p.confidence}</td>
                <td className="px-3 py-2 align-top">
                  <Badge tone={DUPLICATE_TONE[p.duplicateStatus]}>{p.duplicateStatus.replace("_", " ")}</Badge>
                  {p.duplicateMatch ? <p className="mt-1 text-[10px] text-muted">{row.matchedExistingName ?? p.duplicateMatch.existingName}</p> : null}
                </td>
                <td className="px-3 py-2 align-top">
                  <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(row.id, "INCLUDE")}
                        className="rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
                      >
                        ✓ Include
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(row.id, "EXCLUDE")}
                        className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
                      >
                        ✕ Exclude
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAction(row.id, "REVIEW")}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        Review
                      </button>
                    </div>
                    {errors[row.id] ? <span className="text-[10px] text-negative">{errors[row.id]}</span> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
