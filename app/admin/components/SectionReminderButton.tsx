"use client";

import { useState, useTransition } from "react";
import { previewSectionReminderAction, sendSectionReminderAction, type ProfileReminderPreview } from "@/lib/actions/admin-profile-reminder";
import type { ProfileSectionKey } from "@/lib/profile-completion-shared";
import { formatRelativeTime } from "@/lib/format";

/**
 * Compact per-section variant of ProfileReminderCard (Section 28) — same
 * preview-then-send flow and the same server-regenerated-message guarantee,
 * scoped to one section's missing fields. Shows the section's own reminder
 * history first (Section 29) so the founder can see "already reminded twice,
 * last on Tuesday" before sending another one, without a heavier scheduling
 * system.
 */
export default function SectionReminderButton({
  publicUserId,
  section,
  history,
}: {
  publicUserId: string;
  section: ProfileSectionKey;
  history: { lastSentAt: Date; sentCount: number } | undefined;
}) {
  const [preview, setPreview] = useState<ProfileReminderPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview() {
    setError(null);
    setSentMessage(null);
    startTransition(async () => {
      const result = await previewSectionReminderAction(publicUserId, section);
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
      const result = await sendSectionReminderAction(publicUserId, section);
      if (result.error) setError(result.error);
      else {
        setSentMessage(result.success ?? "Reminder sent.");
        setPreview(null);
      }
    });
  }

  const recentlySent = history && Date.now() - history.lastSentAt.getTime() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="mt-2">
      {history ? (
        <p className="text-[10px] text-muted">
          Reminded {history.sentCount}× · last {formatRelativeTime(history.lastSentAt)}
          {recentlySent ? " — reminder recently sent" : ""}
        </p>
      ) : null}

      {!preview ? (
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending}
          className="mt-1 rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-60"
        >
          {isPending ? "Loading…" : "Remind user"}
        </button>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <div className="rounded-sm border border-border bg-background p-2">
            <p className="text-[9px] uppercase tracking-wide text-muted">Preview</p>
            <p className="mt-0.5 text-[11px] font-medium text-foreground">{preview.title}</p>
            <p className="mt-0.5 text-[11px] text-muted">{preview.body}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="rounded-sm bg-accent px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Send reminder"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isPending}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error ? <p className="mt-1 text-[10px] text-negative">{error}</p> : null}
      {sentMessage ? <p className="mt-1 text-[10px] text-positive">{sentMessage}</p> : null}
    </div>
  );
}
