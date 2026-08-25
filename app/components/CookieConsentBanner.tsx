"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/components/ui/Button";
import { acceptCookiesAction, declineCookiesAction, type VisitorSourceInput } from "@/lib/actions/cookie-consent";

/**
 * Bottom bar, not a modal — deliberately never blocks search/filter/navigation
 * (Section 13). Rendered only when app/layout.tsx finds no consent decision
 * cookie yet; hides itself immediately on either choice and refreshes the
 * route so analytics (mi_anon_id, Google Analytics) can activate on this same
 * page load rather than needing a reload.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(true);
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

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-4 sm:bottom-4 sm:max-w-lg sm:rounded-md sm:border"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          We use essential cookies to keep you signed in, and — only if you agree — a first-party analytics cookie to
          understand how people use NoDalalTalks. No advertising cookies, ever.{" "}
          <Link href="/cookie-policy" className="text-accent hover:underline">
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleDecline} disabled={isPending}>
            Decline
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleAccept} disabled={isPending}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
