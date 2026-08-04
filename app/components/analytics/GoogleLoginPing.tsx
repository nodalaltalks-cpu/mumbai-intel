"use client";

import { useEffect } from "react";
import { GA_GOOGLE_LOGIN_COOKIE, trackGoogleLoginSuccess } from "@/lib/analytics/ga";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Mounted once in the root layout. The Google OAuth callback (a Route
 * Handler, which never runs in the browser) can't call `gtag` itself, so it
 * leaves a short-lived, non-httpOnly cookie instead — this fires the GA4
 * event on the first page paint after redirect and immediately clears the
 * cookie so it can never double-fire on a later navigation.
 */
export default function GoogleLoginPing() {
  useEffect(() => {
    if (!readCookie(GA_GOOGLE_LOGIN_COOKIE)) return;
    trackGoogleLoginSuccess();
    document.cookie = `${GA_GOOGLE_LOGIN_COOKIE}=; Max-Age=0; path=/`;
  }, []);

  return null;
}
