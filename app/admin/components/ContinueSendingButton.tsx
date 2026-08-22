"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { processCampaignQueueAction } from "@/lib/actions/email-campaigns";

/** Manual drain trigger for a campaign that still has PENDING recipients — covers a founder revisiting after closing the tab mid-send, ahead of the daily cron safety net. */
export default function ContinueSendingButton({ campaignId, pendingCount }: { campaignId: string; pendingCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await processCampaignQueueAction(campaignId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(`${result.sent ?? 0} sent, ${result.failed ?? 0} failed${result.remaining ? `, ${result.remaining} still remaining` : ""}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-50"
      >
        {isPending ? "Sending…" : `Continue sending (${pendingCount} left)`}
      </button>
      {message ? <span className="text-[10px] text-muted">{message}</span> : null}
    </div>
  );
}
