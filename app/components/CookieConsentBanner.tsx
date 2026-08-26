"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import { acceptCookiesAction, declineCookiesAction, type VisitorSourceInput } from "@/lib/actions/cookie-consent";

/**
 * Rendered only when app/layout.tsx finds no consent decision cookie yet;
 * hides itself immediately on any choice and refreshes the route so
 * analytics (mi_anon_id, Google Analytics) can activate on this same page
 * load rather than needing a reload.
 *
 * Desktop: compact bottom-right card, matching the original design (never
 * blocks search/filter/navigation). Mobile: a centered, prominent card over a
 * light backdrop -- Part 7's ask for "easy thumb interaction" and "excellent
 * spacing" on a device where a thin bottom strip is easy to miss or mis-tap.
 * Either way this never auto-dismisses and closing/ignoring it is never
 * treated as consent (Part 8) -- there is no implicit-accept path anywhere
 * here, only the three explicit buttons below.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(true);
  const [managing, setManaging] = useState(false);
  // The one real non-essential category this app has (first-party analytics /
  // research-event tracking). Not inventing additional toggles for categories
  // that don't exist here -- this app has no ad cookies, no third-party
  // marketing pixels to separately gate.
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Captured once on module init (this component only mounts once, in the root
  // layout, and persists across client-side navigations) — the earliest and
  // most reliable read of document.referrer/UTM params, since it reflects
  // whatever page the visitor actually first landed on rather than whichever
  // page happened to be showing when they clicked Accept (Section 30/31).
  const sourceInfo = useRef<VisitorSourceInput>(
    typeof window === "undefined"
      ? { referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, landingPath: null }
      : (() => {
          let referrerHost: string | null = null;
          try {
            referrerHost = document.referrer ? new URL(document.referrer).hostname : null;
          } catch {
            referrerHost = null;
          }
          const params = new URLSearchParams(window.location.search);
          return {
            referrerHost,
            utmSource: params.get("utm_source"),
            utmMedium: params.get("utm_medium"),
            utmCampaign: params.get("utm_campaign"),
            utmContent: params.get("utm_content"),
            utmTerm: params.get("utm_term"),
            landingPath: window.location.pathname,
          };
        })()
  );

  function handleAccept() {
    startTransition(async () => {
      await acceptCookiesAction(sourceInfo.current);
      setVisible(false);
      router.refresh();
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineCookiesAction();
      setVisible(false);
      router.refresh();
    });
  }

  /** "Manage Preferences" -> "Save preferences" -- routes to the exact same two server actions as the direct buttons, just after the visitor has explicitly seen and chosen the one real category rather than the two blanket options. */
  function handleSavePreferences() {
    if (analyticsEnabled) handleAccept();
    else handleDecline();
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 px-4 py-6 sm:inset-auto sm:bottom-4 sm:right-4 sm:block sm:bg-transparent sm:p-0"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-2xl sm:max-w-sm sm:gap-3 sm:p-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">Your privacy</p>
          <p className="text-sm leading-relaxed text-muted sm:text-xs">
            We use essential cookies to keep you signed in, and — only if you agree — a first-party analytics cookie to
            understand how people use NoDalalTalks. No advertising cookies, ever.{" "}
            <Link href="/cookie-policy" className="text-accent hover:underline">
              Cookie Policy
            </Link>
          </p>
        </div>

        {managing ? (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Essential cookies</p>
                <p className="text-xs text-muted">Keeps you signed in and remembers this choice. Always on.</p>
              </div>
              <span className="mt-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted">
                Required
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
              <div>
                <p className="text-sm font-medium text-foreground">Analytics cookies</p>
                <p className="text-xs text-muted">First-party only — helps us understand usage. Never sold or shared with advertisers.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analyticsEnabled}
                onClick={() => setAnalyticsEnabled((v) => !v)}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${analyticsEnabled ? "bg-accent" : "bg-border"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${analyticsEnabled ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" fullWidth onClick={() => setManaging(false)} disabled={isPending}>
                Back
              </Button>
              <Button type="button" variant="primary" size="sm" fullWidth onClick={handleSavePreferences} disabled={isPending}>
                Save preferences
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="button" variant="primary" size="sm" fullWidth onClick={handleAccept} disabled={isPending}>
                Accept all
              </Button>
              <Button type="button" variant="secondary" size="sm" fullWidth onClick={handleDecline} disabled={isPending}>
                Reject non-essential
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setManaging(true)}
              disabled={isPending}
              className="self-center text-xs text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-60"
            >
              Manage preferences
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
