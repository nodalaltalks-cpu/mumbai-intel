import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import type { ResearchEventType } from "@prisma/client";

const CLIENT_TRIGGERABLE_EVENT_TYPES: ResearchEventType[] = [
  "CONTINUE_RESEARCH_CLICKED",
  "LOCKED_FEATURE_CLICKED",
  "WHATSAPP_SHARE_CLICKED",
  "REFERRAL_SHARE_INITIATED",
  "PROFILE_COMPLETION_ABANDONED",
];

interface ResearchTrackBody {
  eventType?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The one client-triggered research-intent event — a plain navigation click
 * (e.g. "Continue Research") has no existing server round-trip to piggyback
 * on, unlike every other ResearchEventType (recorded directly from a Server
 * Component render or Server Action — see lib/analytics/research-events.ts).
 * Deliberately restricted to CLIENT_TRIGGERABLE_EVENT_TYPES so this route
 * can't be used to spoof e.g. NEWSLETTER_SUBSCRIBED from the client.
 */
export async function POST(req: NextRequest) {
  // Unauthenticated (anonymous browsing is tracked too) — rate-limited by IP for the same
  // reason as /api/analytics/brochure: a client-fired tracking endpoint with no auth needs
  // its own abuse ceiling, independent of any session-based limit.
  const ip = await getClientIp();
  const rateLimit = checkRateLimit(`analytics-research:${ip}`, 60, 60);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

  let body: ResearchTrackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { eventType, entityType, entityId, metadata } = body;
  if (!eventType || !CLIENT_TRIGGERABLE_EVENT_TYPES.includes(eventType as ResearchEventType)) {
    return NextResponse.json({ ok: false, error: "Invalid eventType" }, { status: 400 });
  }

  const sessionId = await getOrCreateAnonSessionId();
  await recordResearchEvent(eventType as ResearchEventType, {
    entityType: entityType as "Project" | "Builder" | "Locality" | "PublicUser" | undefined,
    entityId,
    sessionId,
    metadata,
  });

  return NextResponse.json({ ok: true });
}
