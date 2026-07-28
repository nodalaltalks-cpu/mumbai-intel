"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** "Clear History" / bulk-clear button — a native confirm() first, since this removes everything at once (unlike RemoveItemButton, which removes one row). */
export default function ClearAllButton({
  action,
  confirmText,
  label = "Clear",
}: {
  action: () => Promise<{ error?: string }>;
  confirmText: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          await action();
          router.refresh();
        });
      }}
      className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-negative hover:text-negative disabled:opacity-60"
    >
      {isPending ? "…" : label}
    </button>
  );
}
