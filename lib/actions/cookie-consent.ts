"use server";

import { setCookieConsent } from "@/lib/analytics/consent";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { recordResearchEvent } from "@/lib/analytics/research-events";

/**
 * The two cookie-banner choices. No auth required -- this runs for anonymous
 * visitors by definition. Recording the decision itself uses the existing
 * ResearchEvent pipeline (no second tracking system), matching every other
 * analytics write in this codebase.
 */
export async function acceptCookiesAction(): Promise<void> {
  await setCookieConsent("granted");
  // Only after consent is granted does the anonymous-visitor cookie get created --
  // this call is what actually sets mi_anon_id for the first time.
  const sessionId = await getOrCreateAnonSessionId();
  await recordResearchEvent("COOKIE_CONSENT_GRANTED", { sessionId });
}

export async function declineCookiesAction(): Promise<void> {
  await setCookieConsent("declined");
  // No anon-visitor cookie exists (and none is created) when analytics is declined,
  // so this event is recorded without a sessionId -- identifiable only by this request.
  await recordResearchEvent("COOKIE_CONSENT_DECLINED", { sessionId: null });
}
