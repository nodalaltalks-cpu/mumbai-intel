import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import type { ResearchEventType } from "@prisma/client";

const CLIENT_TRIGGERABLE_EVENT_TYPES: ResearchEventType[] = ["CONTINUE_RESEARCH_CLICKED", "LOCKED_FEATURE_CLICKED"];

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
