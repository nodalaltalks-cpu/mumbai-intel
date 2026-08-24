"use client";

import { useState, useTransition } from "react";
import { previewProfileReminderAction, sendProfileReminderAction, type ProfileReminderPreview } from "@/lib/actions/admin-profile-reminder";

/** Preview-then-send reminder flow (Section 9) — the message is always regenerated server-side from the user's real current state, never hand-typed by the founder and never trusted from the client between preview and send. */
export default function ProfileReminderCard({ publicUserId }: { publicUserId: string }) {
  const [preview, setPreview] = useState<ProfileReminderPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview() {
    setError(null);
    setSentMessage(null);
    startTransition(async () => {
      const result = await previewProfileReminderAction(publicUserId);
      if ("error" in result) {
        setError(result.error);
        setPreview(null);
      } else {
        setPreview(result);
      }
    });
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendProfileReminderAction(publicUserId);
      if (result.error) {
        setError(result.error);
      } else {
        setSentMessage(result.success ?? "Reminder sent.");
        setPreview(null);
      }
    });
  }

  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="font-mono text-sm font-semibold text-foreground">Remind user to complete profile</h2>
      <p className="mt-1 text-xs text-muted">Generates a personalized message from this user&apos;s actual missing fields — nothing to write yourself.</p>

      {!preview ? (
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className="mt-3 rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-60"
        >
          {isPending ? "Loading…" : "Remind user to complete profile"}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="rounded-sm border border-border bg-background p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Preview</p>
            <p className="mt-1 text-sm font-medium text-foreground">{preview.title}</p>
            <p className="mt-1 text-xs text-muted">{preview.body}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="rounded-sm bg-accent px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Send notification"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="rounded-sm border border-border px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-negative">{error}</p> : null}
      {sentMessage ? <p className="mt-2 text-xs text-positive">{sentMessage}</p> : null}
    </section>
  );
}
