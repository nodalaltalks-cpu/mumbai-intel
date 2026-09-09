"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Dialog from "@/app/components/ui/Dialog";

/**
 * Data Sync Control Center fix — Problem 2 (Delete/Trash).
 *
 * A themed confirmation dialog wrapping an EXISTING soft-delete transition
 * for a PENDING staging/candidate record -- never a new mutation path.
 * For a not-yet-approved IngestStagingRecord (Project Review, Transaction
 * Review) that transition IS `rejectStagingRecordAction` (status -> REJECTED);
 * for a Discovery candidate it's `applyDiscoveryFounderAction(id, "EXCLUDE")`
 * (status -> EXCLUDED). Both already are this codebase's safe,
 * recoverable-at-the-data-layer "remove from the active queue" state for an
 * unapproved record (see lib/actions/ingestion.ts / lib/actions/discovery.ts's
 * own doc comments) -- there is no separate `deletedAt` Trash for a row that
 * was never approved into a real Project/Builder/Locality/Transaction, so
 * this dialog does not invent one. It only replaces each surface's previous
 * confirmation UX (a bare 2-click ConfirmButton, or no confirmation at all
 * for Discovery's Exclude) with the richer, explicit copy requested: item
 * identity, a plain-language warning, and separate Cancel / Move to Trash
 * actions.
 */
export default function TrashConfirmButton({
  action,
  itemName,
  itemIdentity,
  label = "Reject",
  triggerClassName = "",
}: {
  /** The EXISTING mutation this dialog confirms -- never defined here. */
  action: () => Promise<{ ok?: boolean; error?: string }>;
  /** e.g. the project/transaction/candidate's proposed name — shown in the confirmation body. */
  itemName: string;
  /** A short identity line (developer, locality, RERA, ...) for founder context — optional, since not every record type has one. */
  itemIdentity?: string | null;
  /** The RESTING button's label -- kept as this surface's own existing, already-understood term ("Reject" / "Exclude") rather than renamed, since it already performs a real soft-delete-to-recoverable-state transition; only the CONFIRMATION step is upgraded. */
  label?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative ${triggerClassName}`}
      >
        {label}
      </button>

      {open ? (
        <Dialog title="Move to Trash?" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3 text-xs">
            <div>
              <p className="font-mono text-sm font-semibold text-foreground">{itemName}</p>
              {itemIdentity ? <p className="mt-0.5 text-muted">{itemIdentity}</p> : null}
            </div>
            <p className="text-warning">This will remove it from the active Data Sync workflow. You can restore it from Trash.</p>
            {error ? <p className="text-negative">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={confirm}
                className="rounded-sm border border-negative/50 bg-negative/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-negative hover:bg-negative/20 disabled:opacity-50"
              >
                {isPending ? "Moving..." : "Move to Trash"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
