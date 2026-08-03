import type { ReactNode } from "react";
import type { PremiumFeature } from "@/lib/premium/types";
import SignInGateCard from "./SignInGateCard";

/**
 * Wraps an already-masked section with the blurred-premium visual + inline
 * unlock card. Server Component, no client JS of its own. Contract: the
 * `children` passed in when `locked` must already be built from masked/
 * placeholder values by the caller (see lib/premium/mask.ts) — this
 * component never receives or hides real data, it only adds the visual
 * treatment to whatever it's given.
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
  if (!locked) return <>{children}</>;

  return (
    <div className={`relative overflow-hidden rounded-sm ${className}`}>
      <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/40 p-3">
        <SignInGateCard feature={feature} next={next} variant="inline" />
      </div>
    </div>
  );
}
