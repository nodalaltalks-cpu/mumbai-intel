"use client";

import { useEffect, useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import Badge from "@/app/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { EnrichmentHistoryEntry } from "@/lib/enrichment/enrichmentHistory";

const ACTION_LABEL: Record<EnrichmentHistoryEntry["action"], string> = {
  ACCEPT: "Accepted",
  EDIT_ACCEPT: "Edited & Accepted",
  REVERT: "Reverted",
  RE_ACCEPT: "Re-accepted",
  REJECT: "Rejected",
};

function displayText(snapshot: EnrichmentHistoryEntry["before"]): string {
  if (!snapshot) return "—";
  if (snapshot.displayItems && snapshot.displayItems.length > 0) return snapshot.displayItems.join(", ");
  return snapshot.displayValue ?? "—";
}

/**
 * Phase 37 -- chronological history for ONE Project enrichment field, built
 * entirely on the existing AuditLog model (same data the Project edit
 * page's own AuditHistory.tsx panel reads, just fetched and filtered to one
 * field via getEnrichmentFieldHistoryAction). Not a second audit system --
 * a bespoke, compact rendering of the same underlying events, since the
 * generic AuditHistory component's key-by-key diff view doesn't match the
 * narrower "previous value -> new value" narrative this needs.
 *
 * Undo only ever appears for the SINGLE MOST RECENT event, and only when
 * that event is itself an accept-type action (not already a Revert) --
 * exactly what `revertEnrichmentFieldAction` will itself re-verify
 * server-side before touching anything (Part "CONCURRENCY / SAFETY").
 */
export default function EnrichmentFieldHistoryDialog({
  fieldLabel,
  entries,
  loading,
  onClose,
  onUndo,
}: {
  fieldLabel: string;
  entries: EnrichmentHistoryEntry[] | null;
  loading: boolean;
  onClose: () => void;
  onUndo: (historyEventId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmingUndo(false);
    setUndoError(null);
  }, [entries]);

  const latest = entries?.[0] ?? null;
  // A rejection never changed the staged value -- there's nothing to undo.
  const canUndo = latest && latest.action !== "REVERT" && latest.action !== "REJECT";

  async function handleUndo() {
    if (!latest) return;
    setUndoing(true);
    const result = await onUndo(latest.id);
    setUndoing(false);
    if (!result.ok) {
      setUndoError(result.error ?? "Could not undo this value.");
      setConfirmingUndo(false);
    }
    // On success the parent re-fetches history and re-renders this dialog
    // with the fresh REVERT event already at the top -- nothing further to
    // do here.
  }

  return (
    <Dialog title={`History: ${fieldLabel}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-xs text-muted">Loading history...</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-xs text-muted">No history recorded yet.</p>
        ) : (
          <>
            {canUndo ? (
              <div className="rounded-sm border border-border bg-surface-raised p-3">
                {confirmingUndo ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-foreground">
                      Revert this accepted enrichment? The previous value will be restored. This action will be recorded in history.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={undoing}
                        onClick={handleUndo}
                        className="rounded-sm border border-negative/40 px-2 py-0.5 text-[10px] font-mono uppercase text-negative hover:bg-negative/10 disabled:opacity-50"
                      >
                        {undoing ? "Reverting..." : "Yes, Revert"}
                      </button>
                      <button
                        type="button"
                        disabled={undoing}
                        onClick={() => setConfirmingUndo(false)}
                        className="rounded-sm border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted hover:border-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingUndo(true)}
                    className="rounded-sm border border-negative/40 px-2 py-1 text-[10px] font-mono uppercase text-negative hover:bg-negative/10"
                  >
                    Undo Accepted Value
                  </button>
                )}
                {undoError ? <p className="mt-2 text-[10px] text-negative">{undoError}</p> : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              {entries.map((entry) => (
                <div key={entry.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={entry.action === "REVERT" ? "muted" : entry.action === "REJECT" ? "negative" : "accent"}>
                      {ACTION_LABEL[entry.action]}
                    </Badge>
                    <span className="text-[11px] text-muted">
                      {entry.actorName ?? "System"} · {formatDateTime(entry.at)}
                    </span>
                  </div>
                  {entry.action === "REJECT" ? (
                    <>
                      <p className="mt-1.5 break-words text-[11px] text-muted">
                        Declined proposed value: <span className="text-foreground">{displayText(entry.after)}</span>
                      </p>
                      {entry.after?.reason ? <p className="mt-0.5 break-words text-[11px] text-foreground">Reason: {entry.after.reason}</p> : null}
                    </>
                  ) : (
                    <p className="mt-1.5 break-words text-[11px] text-muted">
                      <span className="text-foreground">{displayText(entry.before)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-foreground">{displayText(entry.after)}</span>
                    </p>
                  )}
                  {entry.after?.sourceUrl ? <p className="mt-0.5 break-words text-[10px] text-muted">Source: {entry.after.sourceUrl}</p> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
