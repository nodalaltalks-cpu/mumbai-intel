"use client";

import { useState } from "react";
import type { EntityMatchProposal } from "@/lib/enrichment/resolveNamedEntity";

type CardState = "idle" | "saving" | "saved" | "error" | "kept";

/**
 * Builder/Locality resolution card (Phase 33 Part E) -- renders alongside
 * EnrichmentProposalPanel's regular field rows. The enrichment source only
 * ever gives a human-readable NAME; this card resolves that name against
 * the EXISTING Builder/Locality tables and lets the founder EXPLICITLY pick
 * the correct existing row. Nothing here ever creates a Builder or Locality
 * -- a genuinely new name shows "No existing match found" with no create
 * action, per Part Q.
 */
export default function EntityMatchCard({
  proposal,
  onAccept,
}: {
  proposal: EntityMatchProposal;
  onAccept: (existingId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [state, setState] = useState<CardState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleUse(id: string) {
    setState("saving");
    const result = await onAccept(id);
    if (result.ok) {
      setState("saved");
    } else {
      setState("error");
      setError(result.error ?? `Could not save this ${proposal.label.toLowerCase()}.`);
    }
  }

  const busy = state === "saving";
  const done = state === "saved" || state === "kept";

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted">{proposal.label}</span>
        <span className="text-[9px] uppercase tracking-wide text-muted">Existing-record match</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-muted">Current</p>
          <p className="break-words text-foreground">{proposal.currentName ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-muted">Official source</p>
          <p className="break-words text-foreground">{proposal.proposedName}</p>
        </div>
      </div>

      {proposal.match.status === "SINGLE_MATCH" ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-muted">
            Existing match: <span className="text-foreground">{proposal.match.candidates[0].name}</span>
          </p>
          {proposal.classification === "CONFIRMED" ? (
            <p className="text-[10px] text-positive">✓ Already matches this record</p>
          ) : proposal.classification === "CONFLICT" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || done}
                onClick={() => setState("kept")}
                className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
              >
                Keep Current
              </button>
              <button
                type="button"
                disabled={busy || done}
                onClick={() => handleUse(proposal.match.candidates[0].id)}
                className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
              >
                Use Match
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || done}
              onClick={() => handleUse(proposal.match.candidates[0].id)}
              className="w-fit rounded-sm border border-positive/40 px-2 py-0.5 text-[10px] font-mono uppercase text-positive hover:bg-positive/10 disabled:opacity-50"
            >
              Use this {proposal.label}
            </button>
          )}
        </div>
      ) : proposal.match.status === "MULTIPLE_MATCHES" ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-mono uppercase tracking-wide text-warning">Multiple matches — review required</p>
          {proposal.match.candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="text-foreground">{c.name}</span>
              <button
                type="button"
                disabled={busy || done}
                onClick={() => handleUse(c.id)}
                className="rounded-sm border border-warning/40 px-2 py-0.5 text-[10px] font-mono uppercase text-warning hover:bg-warning/10 disabled:opacity-50"
              >
                Use this
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted">No existing {proposal.label.toLowerCase()} found — not created automatically.</p>
      )}

      {state === "saving" ? <span className="text-[10px] text-muted">Saving...</span> : null}
      {state === "saved" ? <span className="text-[10px] text-positive">✓ Saved to pending review</span> : null}
      {state === "kept" ? <span className="text-[10px] text-muted">Keeping current value — no change made</span> : null}
      {state === "error" ? <span className="text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
