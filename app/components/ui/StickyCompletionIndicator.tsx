"use client";

import { useEffect, useState } from "react";
import { useProfileCompletion } from "@/lib/profile-completion-client";

/**
 * Compact floating pill, mobile-only (md:hidden — desktop already sees the
 * full completion card without scrolling past it). Appears only once the
 * user has scrolled past the main completion card, so it's not a redundant
 * second copy of the same number sitting on screen at once. Sits above the
 * safe-area bottom inset, never over form controls (it's a small pill in a
 * corner, not a full-width bar), and collapses to just the percentage on tap.
 */
export default function StickyCompletionIndicator({ anchorId }: { anchorId: string }) {
  const { percent } = useProfileCompletion();
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const target = document.getElementById(anchorId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0), {
      threshold: 0,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [anchorId]);

  if (percent >= 100 || !visible) return null;

  return (
    <button
      type="button"
      onClick={() => (collapsed ? setCollapsed(false) : document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" }))}
      className="mi-fade-in fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-accent/30 bg-surface px-3.5 py-2.5 text-xs font-mono font-semibold text-foreground shadow-2xl md:hidden"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      aria-label={`Profile ${percent}% complete — tap to view progress`}
    >
      <span className="relative flex h-6 w-6 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
          <circle cx="12" cy="12" r="10" strokeWidth="3" className="fill-none stroke-surface-raised" />
          <circle
            cx="12"
            cy="12"
            r="10"
            strokeWidth="3"
            strokeLinecap="round"
            className="fill-none stroke-accent transition-[stroke-dashoffset] duration-500"
            strokeDasharray={62.8}
            strokeDashoffset={62.8 - (62.8 * percent) / 100}
          />
        </svg>
      </span>
      {!collapsed ? (
        <>
          Profile {percent}%
          <span
            aria-hidden="true"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(true);
            }}
            className="ml-0.5 text-muted hover:text-foreground"
          >
            ✕
          </span>
        </>
      ) : null}
    </button>
  );
}
