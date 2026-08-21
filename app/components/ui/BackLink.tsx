"use client";

import { useRouter } from "next/navigation";

/**
 * Public-site equivalent of admin's BackButton (same router.back()-with-
 * fallback pattern) — for top-level analytics/insight destinations that
 * don't already have Breadcrumbs (which already serves as real back-
 * navigation on /reports/* and /transactions/[id], so this is deliberately
 * NOT added there to avoid duplicating navigation). Mobile-first: a plain
 * text link is enough, no icon-only tap target that could be missed.
 */
export default function BackLink({ fallbackHref, label = "Back" }: { fallbackHref: string; label?: string }) {
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
      className="inline-flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
    >
      <span aria-hidden="true">&larr;</span> {label}
    </button>
  );
}
