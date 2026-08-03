"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { PremiumFeature } from "@/lib/premium/types";
import { usePremiumGate } from "@/lib/premium/gate-context";

/**
 * Wraps an already-masked section with the blurred-premium visual. Contract
 * unchanged: `children` passed in when `locked` must already be built from
 * masked/placeholder values by the caller (see lib/premium/mask.ts) — this
 * component never receives or hides real data. Clicking the blurred area
 * opens the single app-wide GlobalSignInModal instead of rendering its own
 * inline unlock card.
 */
export default function PremiumGate({
  locked,
  feature,
  next,
  children,
  className = "",
}: {
  locked: boolean;
  feature: PremiumFeature;
  next: string;
  children: ReactNode;
  className?: string;
}) {
  const { openGate } = usePremiumGate();

  if (!locked) return <>{children}</>;

  function handleOpen() {
    openGate(feature, next, "inline");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label="Sign in to view"
      className={`relative cursor-pointer overflow-hidden rounded-sm ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-60">
        {children}
      </div>
    </div>
  );
}
