"use client";

import { useState } from "react";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import type {
  DiscoveryDuplicateMatch,
  DiscoveryDuplicateStatus,
  DiscoveryStatus,
  ProjectDiscoveryCandidatePayload,
} from "@/lib/ingestion/discovery/types";

export interface DiscoveryCandidateRow {
  id: string;
  status: DiscoveryStatus;
  payload: ProjectDiscoveryCandidatePayload;
  matchedExistingName: string | null;
  /** Phase 58 — a freshly re-checked duplicate result (same check Include itself runs), null when it couldn't be re-checked (locality unresolved) or wasn't attempted (row already resolved) — the UI falls back to payload.duplicateStatus/duplicateMatch in that case. */
  liveDuplicateStatus: DiscoveryDuplicateStatus | null;
  liveDuplicateMatch: DiscoveryDuplicateMatch | null;
  createdAt: string;
}

const STATUS_TONE: Record<DiscoveryStatus, BadgeTone> = {
  DISCOVERED: "muted",
  SOURCE_FOUND: "info",
  READY_FOR_ENRICHMENT: "positive",
  PROJECT_STAGED: "positive",
  ENRICHED: "positive",
  NEEDS_REVIEW: "warning",
  REJECTED_DUPLICATE: "negative",
  EXCLUDED: "muted",
};

interface DuplicateDisplay {
  tone: BadgeTone;
  /** Short badge label — plain language, no raw enum values (Phase 58 Part 5: founders/non-technical users read this). */
  label: string;
  /** One-line summary shown under the badge. */
  headline: string;
  /** True for a duplicate the system already knows about (EXACT/CLEAR_ALIAS) — Include is disabled rather than left to fail after a confusing click. */
  blocksInclude: boolean;
  /** Plain-language reason shown next to the Include button when blocksInclude is true. */
  explanation: string | null;
}

/**
 * Phase 58 — turns a duplicate result (live-checked when available, the
 * stored snapshot otherwise — see liveDuplicateStatus.ts) into what a
 * founder should actually see: never a bare "EXACT"/"CLEAR_ALIAS"/
 * "AMBIGUOUS" label. The raw technical status is still shown, just
 * secondary/small, per Phase 58's own instruction to keep it available for
 * debugging without leading with it.
 *
 * `confirmedByStatus` is set when the candidate's own `status` is already
 * REJECTED_DUPLICATE — the real bug this phase fixes: applyDiscoveryFounderAction
 * (lib/actions/discovery.ts) sets that status the moment Include finds a live
 * duplicate, but never rewrites the payload's own `duplicateStatus` field to
 * match, so it can stay frozen at "NO_MATCH" forever after. A REJECTED_DUPLICATE
 * status is a DECISIVE, already-made determination — more reliable than that
 * frozen field — so it always wins here, regardless of what `status` (the
 * duplicateStatus enum value, confusingly reused as this function's own first
 * parameter name below) says.
 */
function describeDuplicate(status: DiscoveryDuplicateStatus, existingName: string | null, confirmedByStatus: boolean): DuplicateDisplay {
  const name = existingName || null;
  if (confirmedByStatus || status === "EXACT" || status === "CLEAR_ALIAS") {
    return {
      tone: "negative",
      label: "Duplicate",
      headline: name ? `Already exists as "${name}"` : "This project already exists in Mumbai Intel",
      blocksInclude: true,
      explanation: name
        ? `Not included because this project already exists in Mumbai Intel as "${name}".`
        : "Not included because this project already exists in Mumbai Intel.",
    };
  }
  if (status === "AMBIGUOUS") {
    return {
      tone: "warning",
      label: "Possible duplicate",
      headline: name ? `May already exist as "${name}"` : "May already exist — needs a look",
      blocksInclude: false,
      explanation: null,
    };
  }
  return { tone: "positive", label: "New", headline: "No matching project found", blocksInclude: false, explanation: null };
}

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
  onAction: (id: string, action: DiscoveryFounderAction) => Promise<{ ok: boolean; error?: string; projectStagingRecordId?: string }>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localStatus, setLocalStatus] = useState<Record<string, DiscoveryStatus>>({});
  const [stagedProjectId, setStagedProjectId] = useState<Record<string, string>>({});

  async function handleAction(id: string, action: DiscoveryFounderAction) {
    setBusyId(id);
    const result = await onAction(id, action);
    setBusyId(null);
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [id]: "" }));
      const next: DiscoveryStatus = action === "EXCLUDE" ? "EXCLUDED" : action === "REVIEW" ? "NEEDS_REVIEW" : "PROJECT_STAGED";
      setLocalStatus((prev) => ({ ...prev, [id]: next }));
      if (result.projectStagingRecordId) setStagedProjectId((prev) => ({ ...prev, [id]: result.projectStagingRecordId! }));
    } else {
      setErrors((prev) => ({ ...prev, [id]: result.error ?? "Could not update this candidate." }));
    }
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-sm border border-border">
      <table className="w-full min-w-[1100px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface-raised">
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 text-left">Project</th>
            <th className="px-3 py-2 text-left">Developer</th>
            <th className="px-3 py-2 text-left">Area</th>
            <th className="px-3 py-2 text-left">Source URL</th>
            <th className="px-3 py-2 text-left">Discovery source</th>
            <th className="px-3 py-2 text-left">Official source</th>
            <th className="px-3 py-2 text-left">Confidence</th>
            <th className="px-3 py-2 text-left">Already exists?</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = localStatus[row.id] ?? row.status;
            const busy = busyId === row.id;
            const p = row.payload;
            // Phase 58 — prefer the freshly re-checked result over the stored snapshot, so the badge and the
            // Include button always agree with what clicking Include would actually do.
            const effectiveDuplicateStatus = row.liveDuplicateStatus ?? p.duplicateStatus;
            const effectiveDuplicateMatch = row.liveDuplicateMatch ?? p.duplicateMatch;
            // The name to actually show: prefer matchedExistingName (a live DB lookup against the
            // matched Project/pending-staging row's CURRENT name), since payload.duplicateMatch can be
            // null even when status is already REJECTED_DUPLICATE — applyDiscoveryFounderAction updates
            // matchedExistingId at Include time but never rewrites the payload snapshot to match.
            const displayExistingName = row.matchedExistingName ?? effectiveDuplicateMatch?.existingName ?? null;
            const duplicateInfo = describeDuplicate(effectiveDuplicateStatus, displayExistingName, status === "REJECTED_DUPLICATE");
            return (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 align-top text-foreground">{p.projectName}</td>
                <td className="px-3 py-2 align-top text-foreground">{p.developerName}</td>
                <td className="px-3 py-2 align-top text-muted">{p.areaName}</td>
                <td className="px-3 py-2 align-top">
                  <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
                    {p.sourceUrl}
                  </a>
                </td>
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
                  <Badge tone={duplicateInfo.tone}>{duplicateInfo.label}</Badge>
                  <p className="mt-1 text-[10px] text-foreground">{duplicateInfo.headline}</p>
                  <p className="mt-0.5 text-[9px] text-muted">technical: {effectiveDuplicateStatus.replace("_", " ")}</p>
                </td>
                <td className="px-3 py-2 align-top">
                  <Badge tone={STATUS_TONE[status]}>{status.replace(/_/g, " ")}</Badge>
                  {stagedProjectId[row.id] ? (
                    <p className="mt-1">
                      <a href={`/admin/data-sync/review`} className="text-[10px] text-accent hover:underline">
                        View in Project Review Queue →
                      </a>
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy || status === "PROJECT_STAGED" || status === "REJECTED_DUPLICATE" || duplicateInfo.blocksInclude}
                        onClick={() => handleAction(row.id, "INCLUDE")}
                        title={duplicateInfo.blocksInclude ? duplicateInfo.explanation ?? undefined : undefined}
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
                    {duplicateInfo.blocksInclude && status !== "PROJECT_STAGED" ? (
                      <span className="text-[10px] text-muted">{duplicateInfo.explanation}</span>
                    ) : null}
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
