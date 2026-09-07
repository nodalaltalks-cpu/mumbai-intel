"use client";

import Dialog from "@/app/components/ui/Dialog";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import type { ResearchRunStatus } from "@/lib/actions/research";
import EnrichmentProposalPanel from "./EnrichmentProposalPanel";

/**
 * Targeted fix (Research Automation, Section 16/17) -- the founder-facing
 * "Research Project" surface. Deliberately a thin wrapper, not a rebuilt
 * proposal UI: EnrichmentProposalPanel (Accept/Edit/Reject/View History,
 * Cover Image/Brochure upload, FOUNDER_EDITED status, real-time counts) is
 * reused UNCHANGED -- a research-sourced proposal is Accepted through the
 * EXACT SAME acceptEnrichmentFieldAction as an official-adapter proposal,
 * so there is nothing field-specific to rebuild here.
 *
 * Status copy is intentionally distinct from EnrichmentDialog's own
 * STATUS_COPY (Section 17: "the UI must accurately communicate whether
 * research is actually available") -- NOT_CONFIGURED explicitly says no
 * automated provider exists yet, rather than reusing a misleading
 * "official source not found" message that implies a live search was
 * actually attempted.
 */
const STATUS_COPY: Record<string, string> = {
  NO_NEW_INFO: "Research ran, but found nothing new — every researched field already matches what's on file or wasn't confidently extractable.",
  OUT_OF_SCOPE: "This project is outside Mumbai city — research is Mumbai-city residential only.",
  NOT_CONFIGURED:
    "No automated research provider is configured in this environment yet (no search API is wired up). Research evidence can still be submitted from an interactive Claude + Chrome research session via the same safety pipeline.",
  NO_TARGET_FIELDS: "Every researchable field for this project is already resolved — nothing left to research.",
  NOT_FOUND: "Staging record not found.",
  ERROR: "Research couldn't run for this record.",
};

export default function ResearchDialog({
  title,
  loading,
  status,
  fields,
  error,
  rejectedFindings,
  onClose,
  onRetry,
  onAcceptField,
  onRejectField,
  onUploadMedia,
  onViewHistory,
  onUndo,
}: {
  title: string;
  loading: boolean;
  status: ResearchRunStatus | null;
  fields: EnrichmentField[] | null;
  error: string | null;
  rejectedFindings?: { fieldKey: string; sourceUrl: string; reason: string }[];
  onClose: () => void;
  onRetry: () => void;
  onAcceptField: (
    field: EnrichmentField,
    editContext?: { founderEdited: true; overriddenValue: string | null; overriddenItems?: string[] }
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectField: (field: EnrichmentField, reason: string) => Promise<{ ok: boolean; error?: string }>;
  onUploadMedia: (
    fieldKey: string,
    file: File,
    editContext: { overriddenValue: string | null; overriddenItems?: string[]; sourceUrl: string | null }
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onViewHistory: (fieldKey: string) => Promise<EnrichmentHistoryEntry[]>;
  onUndo: (fieldKey: string, historyEventId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <Dialog title={`Research: ${title}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-xs text-muted">Researching project...</p>
        ) : fields && fields.length > 0 ? (
          <>
            <p className={`text-xs ${status === "SUCCESS" ? "text-positive" : "text-muted"}`}>
              {status === "SUCCESS" ? "Research results ready." : (status && STATUS_COPY[status]) || "Research complete."}
            </p>
            {rejectedFindings && rejectedFindings.length > 0 ? (
              <div className="rounded-sm border border-warning/40 bg-warning/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-warning">
                  {rejectedFindings.length} finding{rejectedFindings.length === 1 ? "" : "s"} could not be verified and were not included
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {rejectedFindings.map((r, i) => (
                    <li key={i} className="text-[11px] text-muted">
                      <span className="font-mono text-foreground">{r.fieldKey}</span> —{" "}
                      <span className="break-all">{r.sourceUrl || "(no source)"}</span>: {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <EnrichmentProposalPanel
              fields={fields}
              onAcceptField={onAcceptField}
              onRejectField={onRejectField}
              onUploadMedia={onUploadMedia}
              onViewHistory={onViewHistory}
              onUndo={onUndo}
            />
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{(status && STATUS_COPY[status]) || error || "Research couldn't run for this record."}</p>
            {rejectedFindings && rejectedFindings.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {rejectedFindings.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted">
                    <span className="font-mono text-foreground">{r.fieldKey}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="w-fit rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
