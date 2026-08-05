"use client";

import Link from "next/link";
import GoogleButton from "@/app/components/auth/GoogleButton";
import { trackResearchEvent } from "@/lib/track-research";
import { useGateRequest } from "@/lib/premium/gate-context";
import { PREMIUM_BENEFITS, PREMIUM_CARD_SUBTITLE, PREMIUM_CARD_TITLE } from "@/lib/premium/types";
import { IconClose } from "@/app/components/ui/icons";

/**
 * The one and only sign-in gate in the app. Mounted once at the root
 * (PremiumGateProvider) and driven entirely by gate-context state — every
 * blurred section and every gated button opens this same instance instead
 * of rendering its own copy.
 */
export default function GlobalSignInModal() {
  const { request, closeGate } = useGateRequest();
  if (!request) return null;

  const { feature, next, trigger } = request;

  function fireLockedClick() {
    trackResearchEvent("LOCKED_FEATURE_CLICKED", undefined, undefined, { feature, trigger });
  }

  return (
    <div
      className="mi-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-background/50 backdrop-blur-md sm:items-center sm:p-4"
      onClick={closeGate}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={PREMIUM_CARD_TITLE}
        className="mi-pop-in flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:max-w-sm sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky so the headline stays visible even when the benefits list below needs to scroll on short viewports. */}
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-0 sm:p-7 sm:pb-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{PREMIUM_CARD_TITLE}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{PREMIUM_CARD_SUBTITLE}</p>
          </div>
          <button
            type="button"
            onClick={closeGate}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-6 pt-5 sm:p-7 sm:pt-5">
          <ul className="flex flex-col gap-2 text-sm text-foreground">
            {PREMIUM_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className="mt-0.5 text-positive">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-2.5" onClick={fireLockedClick}>
              <GoogleButton next={next} />
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
              >
                Continue with Email
              </Link>
            </div>
            <button
              type="button"
              onClick={closeGate}
              className="w-full py-1 text-center text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-foreground hover:underline" onClick={fireLockedClick}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
