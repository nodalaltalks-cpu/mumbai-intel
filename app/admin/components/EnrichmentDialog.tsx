"use client";

import Dialog from "@/app/components/ui/Dialog";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";
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
  onAcceptEntityMatch,
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
  onAcceptField: (field: EnrichmentField) => Promise<{ ok: boolean; error?: string }>;
  onAcceptEntityMatch: (kind: "builder" | "locality", existingId: string) => Promise<{ ok: boolean; error?: string }>;
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
                {builderMatch ? <EntityMatchCard proposal={builderMatch} onAccept={(id) => onAcceptEntityMatch("builder", id)} /> : null}
                {localityMatch ? <EntityMatchCard proposal={localityMatch} onAccept={(id) => onAcceptEntityMatch("locality", id)} /> : null}
              </div>
            ) : null}
            <EnrichmentProposalPanel fields={fields} onAcceptField={onAcceptField} />
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
