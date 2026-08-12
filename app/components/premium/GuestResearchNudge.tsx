"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePremiumGate } from "@/lib/premium/gate-context";

const NUDGE_DELAY_MS = 60 * 1000;
const NUDGE_SHOWN_KEY = "mi_research_nudge_shown";

/**
 * Proactive sign-in nudge for anonymous visitors: after 60s of browsing the
 * public site without an account, surfaces the same GlobalSignInModal once
 * on its own — additive to (not a replacement for) the existing gates that
 * open it immediately on a locked click. Mounted once at the root
 * (PremiumGateProvider) so the 60s clock survives client-side navigation
 * between pages instead of resetting on every route change.
 */
export default function GuestResearchNudge({ isGuest }: { isGuest: boolean }) {
  const { openGate } = usePremiumGate();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isGuest) return;
    if (window.sessionStorage.getItem(NUDGE_SHOWN_KEY)) return;

    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(NUDGE_SHOWN_KEY, "1");
      openGate("research-nudge", pathnameRef.current);
    }, NUDGE_DELAY_MS);

    return () => window.clearTimeout(timer);
    // Deliberately only [isGuest, openGate] — both stable for the life of the
    // tab (isGuest comes from the server-rendered root layout, openGate is a
    // useCallback with no deps) — so the timer is armed once per session
    // instead of restarting every time pathname changes on navigation.
  }, [isGuest, openGate]);

  return null;
}
