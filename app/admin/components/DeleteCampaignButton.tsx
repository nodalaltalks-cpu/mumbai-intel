"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteCampaignAction } from "@/lib/actions/email-campaigns";

/** Same native-confirm delete pattern as ReportQueueList's report delete — explicit "permanently deleted" wording, no accidental one-click deletion. */
export default function DeleteCampaignButton({ campaignId, subject }: { campaignId: string; subject: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete this campaign permanently?\n\n"${subject}" and its recipient records will be removed from admin view. Registered user accounts are not affected. This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteCampaignAction(campaignId);
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
      {isPending ? "Deleting..." : "Delete Campaign"}
    </button>
  );
}
