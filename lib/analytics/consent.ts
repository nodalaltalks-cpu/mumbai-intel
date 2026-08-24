import "server-only";
import { cookies } from "next/headers";
import { CONSENT_COOKIE_NAME, type ConsentValue } from "./consent-constants";

export type { ConsentValue };

/**
 * Cookie consent decision — separate from mi_anon_id itself (lib/analytics/session-id.ts).
 * This cookie only ever stores the visitor's *choice*, never any tracking
 * data, so it's safe to set unconditionally (it IS the "necessary" cookie
 * that remembers the necessary-vs-analytics distinction). One-year lifetime,
 * matching mi_anon_id's own.
 */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Read-only peek — safe from a Server Component render. Null means the visitor hasn't decided yet. */
export async function peekCookieConsent(): Promise<ConsentValue | null> {
  const store = await cookies();
  const value = store.get(CONSENT_COOKIE_NAME)?.value;
  return value === "granted" || value === "declined" ? value : null;
}

/** Only callable from a Route Handler or Server Action (where cookies() is writable). */
export async function setCookieConsent(value: ConsentValue): Promise<void> {
  const store = await cookies();
  store.set(CONSENT_COOKIE_NAME, value, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR_SECONDS, path: "/" });
}

/** True only once the visitor has explicitly granted analytics/research cookies -- never assumed. */
export async function hasAnalyticsConsent(): Promise<boolean> {
  return (await peekCookieConsent()) === "granted";
}
