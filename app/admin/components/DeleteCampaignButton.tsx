"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { trashCampaignAction } from "@/lib/actions/email-campaigns";

/** Moves the campaign to Trash (recoverable) rather than deleting it outright — permanent deletion now lives in Trash itself, gated behind founder re-authentication. */
export default function DeleteCampaignButton({ campaignId, subject }: { campaignId: string; subject: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Move this campaign to Trash?\n\n"${subject}" will be removed from the campaign list but can be restored later from Trash.`)) return;
    startTransition(async () => {
      const result = await trashCampaignAction(campaignId);
      if (result.error) {
        // eslint-disable-next-line no-alert
        alert(result.error);
        return;
      }
      router.push("/admin/email");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="shrink-0 rounded-sm border border-negative/40 px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-negative hover:bg-negative/10 disabled:opacity-60"
    >
      {isPending ? "Moving..." : "Move to Trash"}
    </button>
  );
}
