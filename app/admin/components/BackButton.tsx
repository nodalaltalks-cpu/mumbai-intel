"use client";

import { useRouter } from "next/navigation";

/**
 * Every "New X" / "Edit X" / "Preview X" admin page is only reachable by
 * drilling in from a list — there was no way back except the sidebar (which
 * jumps to the unfiltered list, losing whatever search/filter/page you came
 * from). `router.back()` returns to that exact prior view; `fallbackHref`
 * covers the case where the page was opened directly (no history entry to
 * go back to, e.g. a bookmarked or newly-opened-tab URL).
 */
export default function BackButton({ fallbackHref, label = "Back" }: { fallbackHref: string; label?: string }) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex w-fit items-center gap-1 text-xs font-mono uppercase tracking-wide text-muted hover:text-accent"
    >
      <span aria-hidden="true">&larr;</span> {label}
    </button>
  );
}
