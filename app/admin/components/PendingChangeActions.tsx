"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approvePendingChangeAction, rejectPendingChangeAction } from "@/lib/actions/pending-changes";

/** Approve/reject controls for one PendingChange row — ADMIN-only (both actions re-check requireAdminSession() server-side regardless of what this renders). */
export default function PendingChangeActions({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approvePendingChangeAction(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectPendingChangeAction(id, note.trim() || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note for the record"
          className="w-full resize-none rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={reject}
            className="rounded-sm border border-negative/40 bg-negative/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-negative hover:bg-negative/20 disabled:opacity-60"
          >
            {isPending ? "…" : "Confirm reject"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="text-[10px] text-negative">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={approve}
          className="rounded-sm border border-positive/40 bg-positive/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-positive hover:bg-positive/20 disabled:opacity-60"
        >
          {isPending ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setRejecting(true)}
          className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {error ? <p className="text-[10px] text-negative">{error}</p> : null}
    </div>
  );
}
