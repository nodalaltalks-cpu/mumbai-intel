"use client";

import Dialog from "@/app/components/ui/Dialog";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";
import type { EnrichProjectStatus } from "@/lib/actions/enrichment";
import EnrichmentProposalPanel from "./EnrichmentProposalPanel";
import EntityMatchCard from "./EntityMatchCard";

const STATUS_COPY: Record<Exclude<EnrichProjectStatus, "SUCCESS">, string> = {
  NO_SOURCE: "Official source not found. This project's developer isn't in the curated official-source list yet, so nothing was fetched.",
  SOURCE_UNAVAILABLE: "Official source temporarily unavailable. The live page couldn't be fetched just now — try again in a moment.",
  NO_NEW_INFO: "No additional reliable data found. Everything the official source has either already matches this project or wasn't confidently extractable.",
  ERROR: "Enrichment couldn't run for this record.",
};

export default function EnrichmentDialog({
  title,
  loading,
  status,
  fields,
  builderMatch,
  localityMatch,
  error,
  onClose,
  onRetry,
  onAcceptField,
  onRejectField,
  onUploadMedia,
  onAcceptEntityMatch,
  onRejectEntityMatch,
  onViewHistory,
  onUndo,
}: {
  title: string;
  loading: boolean;
  status: EnrichProjectStatus | null;
  fields: EnrichmentField[] | null;
  builderMatch?: EntityMatchProposal;
  localityMatch?: EntityMatchProposal;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onAcceptField: (
    field: EnrichmentField,
    editContext?: { founderEdited: true; overriddenValue: string | null; overriddenItems?: string[] }
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectField: (field: EnrichmentField, reason: string) => Promise<{ ok: boolean; error?: string }>;
  /** Targeted fix (Cover Image/Brochure upload) -- a real file upload, distinct from a text-value accept. */
  onUploadMedia: (
    fieldKey: string,
    file: File,
    editContext: { overriddenValue: string | null; overriddenItems?: string[]; sourceUrl: string | null }
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onAcceptEntityMatch: (kind: "builder" | "locality", existingId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Targeted fix (Reject option consistency) -- the entity-match card's own reason-required reject, distinct from a regular field's onRejectField. */
  onRejectEntityMatch: (kind: "builder" | "locality", reason: string, proposedName: string) => Promise<{ ok: boolean; error?: string }>;
  onViewHistory: (fieldKey: string) => Promise<EnrichmentHistoryEntry[]>;
  onUndo: (fieldKey: string, historyEventId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <Dialog title={`Enrich: ${title}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-xs text-muted">Enriching project...</p>
        ) : status === "SUCCESS" && fields ? (
          <>
            <p className="text-xs text-positive">Enrichment results ready.</p>
            {builderMatch || localityMatch ? (
              <div className="flex flex-col divide-y divide-border rounded-sm border border-border">
                {builderMatch ? (
                  <EntityMatchCard
                    proposal={builderMatch}
                    onAccept={(id) => onAcceptEntityMatch("builder", id)}
                    onReject={(reason) => onRejectEntityMatch("builder", reason, builderMatch.proposedName)}
                  />
                ) : null}
                {localityMatch ? (
                  <EntityMatchCard
                    proposal={localityMatch}
                    onAccept={(id) => onAcceptEntityMatch("locality", id)}
                    onReject={(reason) => onRejectEntityMatch("locality", reason, localityMatch.proposedName)}
                  />
                ) : null}
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
        ) : status === "NO_SOURCE" || status === "SOURCE_UNAVAILABLE" || status === "NO_NEW_INFO" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">{STATUS_COPY[status]}</p>
            <button
              type="button"
              onClick={onRetry}
              className="w-fit rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-negative">{error ?? STATUS_COPY.ERROR}</p>
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
