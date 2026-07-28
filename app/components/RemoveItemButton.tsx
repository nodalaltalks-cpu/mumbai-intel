"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Generic single-click remove button for dashboard lists (Recently Viewed / Wishlist / Saved Searches) — lower-stakes than an admin delete, so no double-click confirm needed. */
export default function RemoveItemButton({
  action,
  label = "Remove",
}: {
  action: () => Promise<{ error?: string }>;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await action();
          router.refresh();
        })
      }
      className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-negative hover:text-negative disabled:opacity-60"
    >
      {isPending ? "…" : label}
    </button>
  );
}
