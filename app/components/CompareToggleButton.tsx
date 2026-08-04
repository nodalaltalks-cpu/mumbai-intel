"use client";

import { useState } from "react";
import { COMPARE_LIST_MAX, toggleCompareItem, useCompareList } from "@/lib/compare-list";
import { trackCompareClicked } from "@/lib/analytics/ga";

/** Anonymous-friendly Compare toggle (localStorage, no sign-in) — the Compare counterpart to WishlistButton/SaveProjectButton, which both require a public-user session. */
export default function CompareToggleButton({ slug, className = "" }: { slug: string; className?: string }) {
  const list = useCompareList();
  const inList = list.includes(slug);
  const [fullNotice, setFullNotice] = useState(false);

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const result = toggleCompareItem(slug);
          setFullNotice(result.full);
          if (result.inList) trackCompareClicked(slug, list.length + 1);
        }}
        className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ${
          inList ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {inList ? "✓ In Compare" : "+ Compare"}
      </button>
      {fullNotice ? <span className="text-[10px] text-negative">Compare up to {COMPARE_LIST_MAX} at a time.</span> : null}
    </div>
  );
}
