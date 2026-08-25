"use client";

import { useState, useTransition } from "react";
import {
  previewActivityDeletionAction,
  deleteActivityOlderThanAction,
  type ActivityRetentionKey,
  type ActivityRetentionPreview,
} from "@/lib/actions/activity-cleanup";

const OPTIONS: { key: ActivityRetentionKey; label: string }[] = [
  { key: "1day", label: "Older than 1 day" },
  { key: "1week", label: "Older than 1 week" },
  { key: "1month", label: "Older than 1 month" },
  { key: "6months", label: "Older than 6 months" },
  { key: "1year", label: "Older than 1 year" },
  { key: "all", label: "All activity" },
];

/** Founder-only Activity Feed cleanup (Section 32) — modeled on Google's own "delete activity older than" pattern: pick a window, see a real count, confirm, done. Never touches anything but the Activity Feed's own AuditLog rows. */
export default function ActivityRetentionCard() {
  const [preview, setPreview] = useState<ActivityRetentionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview(key: ActivityRetentionKey) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await previewActivityDeletionAction(key);
      if ("error" in res) setError(res.error);
      else setPreview(res);
    });
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const res = await deleteActivityOlderThanAction(preview.key);
      if (res.error) setError(res.error);
      else setResult(res.success ?? "Done.");
      setPreview(null);
    });
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h2 className="font-mono text-sm font-semibold text-foreground">Activity Storage</h2>
      <p className="mt-1 text-xs text-muted">
        Removes old Activity Feed history to keep things tidy. Never affects projects, transactions, users, analytics, notifications, or uploaded files.
      </p>

      {result ? <div className="mt-3 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">{result}</div> : null}
      {error ? <div className="mt-3 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{error}</div> : null}

      {preview ? (
        <div className="mt-3 rounded-sm border border-negative/40 bg-negative/5 p-3">
          <p className="text-xs font-semibold text-foreground">Delete activity {preview.label === "all time" ? "— all of it" : `older than ${preview.label}`}?</p>
          <p className="mt-1 text-[11px] text-muted">
            {preview.count.toLocaleString("en-IN")} activity record{preview.count === 1 ? "" : "s"} will be permanently removed. This cannot be undone.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || preview.count === 0}
              className="rounded-sm bg-negative px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-negative/80 disabled:opacity-60"
            >
              {isPending ? "Deleting…" : preview.count === 0 ? "Nothing to delete" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => handlePreview(o.key)}
              disabled={isPending}
              className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
