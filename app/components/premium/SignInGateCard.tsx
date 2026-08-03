"use client";

import Link from "next/link";
import GoogleButton from "@/app/components/auth/GoogleButton";
import { trackResearchEvent } from "@/lib/track-research";
import { PREMIUM_BENEFITS, PREMIUM_CARD_SUBTITLE, PREMIUM_CARD_TITLE, type PremiumFeature } from "@/lib/premium/types";

/**
 * The one "unlock premium intelligence" card — reused both inline
 * (PremiumGate, absolutely positioned over blurred content) and inside
 * SignInGateModal for click-triggered flows. Every affordance links into the
 * existing /login, /signup, /api/auth/google routes with `next` set to the
 * exact originating page — no auth UI is reimplemented here.
 */
export default function SignInGateCard({
  feature,
  next,
  variant = "inline",
}: {
  feature: PremiumFeature;
  next: string;
  variant?: "inline" | "modal";
}) {
  function fireLockedClick() {
    trackResearchEvent("LOCKED_FEATURE_CLICKED", undefined, undefined, { feature, trigger: variant });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-md border border-border bg-surface/95 backdrop-blur ${
        variant === "inline" ? "w-full max-w-xs p-4 text-center shadow-xl" : "w-full"
      }`}
    >
      <div>
        <h3 className="font-mono text-sm font-semibold text-foreground">{PREMIUM_CARD_TITLE}</h3>
        <p className="mt-1 text-xs text-muted">{PREMIUM_CARD_SUBTITLE}</p>
      </div>

      <ul className="flex flex-col gap-1 text-left text-xs text-foreground">
        {PREMIUM_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-1.5">
            <span className="text-positive">✓</span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2" onClick={fireLockedClick}>
        <GoogleButton next={next} />
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
        >
          Continue with Email
        </Link>
      </div>

      <p className="text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-foreground hover:underline" onClick={fireLockedClick}>
          Sign In
        </Link>
      </p>
    </div>
  );
}
