"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationReadAction } from "@/lib/actions/notifications";

export default function DismissCapacityWarningButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      await markNotificationReadAction(notificationId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={isPending}
      className="shrink-0 rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-foreground hover:text-foreground disabled:opacity-50"
    >
      Dismiss
    </button>
  );
}
