import { NextResponse } from "next/server";
import { getPublicSession } from "@/lib/public-auth/session";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { anonymousSubjectKey, recordHeartbeat, registeredSubjectKey } from "@/lib/platform-metrics/presence";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

/**
 * Platform Capacity presence heartbeat (Part 3 of the spec) — the public
 * layout's client-side PresenceHeartbeat component POSTs here every ~20s
 * while the tab is visible. Deliberately a Route Handler, not a Server
 * Action: a Server Action would count as a full page-shaped RSC round trip,
 * where this needs to be the cheapest possible request — one small JSON
 * write, upserting a single row (see lib/platform-metrics/presence.ts),
 * never a new row per beat.
 *
 * A signed-in visitor is identified by their PublicUser id (one row across
 * every tab/device); an anonymous visitor by the existing mi_anon_id
 * cookie, gated by the same analytics-consent check every other anonymous
 * tracking surface in this app already goes through — a visitor who has not
 * consented is simply not counted, exactly like every other anonymous
 * signal here.
 */
export async function POST() {
  const session = await getPublicSession();

  let subjectKey: string;
  let publicUserId: string | null;
  const isAnonymous = session === null;

  if (session) {
    subjectKey = registeredSubjectKey(session.userId);
    publicUserId = session.userId;
  } else {
    const anonId = await getOrCreateAnonSessionId();
    if (!anonId) {
      // No analytics consent yet — heartbeat is a no-op, not an error.
      return NextResponse.json({ tracked: false });
    }
    subjectKey = anonymousSubjectKey(anonId);
    publicUserId = null;
  }

  // Cheap abuse guard — a real browser tab heartbeats at ~20s intervals, so
  // a much tighter limit still comfortably allows normal use while capping
  // a scripted hammer of this endpoint.
  const rateLimitKey = `presence-heartbeat:${subjectKey}:${await getClientIp()}`;
  const { allowed } = checkRateLimit(rateLimitKey, 6, 60);
  if (!allowed) return NextResponse.json({ tracked: false }, { status: 429 });

  await recordHeartbeat({ subjectKey, publicUserId, isAnonymous });
  return NextResponse.json({ tracked: true });
}
