"use server";

import { setCookieConsent } from "@/lib/analytics/consent";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { classifyVisitorSource } from "@/lib/analytics/visitor-source-constants";

export interface VisitorSourceInput {
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * The two cookie-banner choices. No auth required -- this runs for anonymous
 * visitors by definition. Recording the decision itself uses the existing
 * ResearchEvent pipeline (no second tracking system), matching every other
 * analytics write in this codebase.
 *
 * `sourceInfo` (Section 30) is read client-side from document.referrer/UTM
 * params at the moment the banner first rendered -- the earliest reliable
 * capture point, since granting consent is also the moment a session id
 * first exists to attach it to. Optional: absent for a decline or if the
 * browser blocked reading document.referrer.
 */
export async function acceptCookiesAction(sourceInfo?: VisitorSourceInput): Promise<void> {
  await setCookieConsent("granted");
  // Only after consent is granted does the anonymous-visitor cookie get created --
  // this call is what actually sets mi_anon_id for the first time.
  const sessionId = await getOrCreateAnonSessionId();
  await recordResearchEvent("COOKIE_CONSENT_GRANTED", { sessionId });

  if (sourceInfo) {
    const source = classifyVisitorSource(sourceInfo.referrerHost, sourceInfo.utmSource);
    await recordResearchEvent("VISITOR_SOURCE_IDENTIFIED", {
      sessionId,
      metadata: { source, referrerHost: sourceInfo.referrerHost, utmSource: sourceInfo.utmSource, utmMedium: sourceInfo.utmMedium, utmCampaign: sourceInfo.utmCampaign },
    });
  }
}

export async function declineCookiesAction(): Promise<void> {
  await setCookieConsent("declined");
  // No anon-visitor cookie exists (and none is created) when analytics is declined,
  // so this event is recorded without a sessionId -- identifiable only by this request.
  await recordResearchEvent("COOKIE_CONSENT_DECLINED", { sessionId: null });
}
