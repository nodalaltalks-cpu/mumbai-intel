import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { getClientIp } from "@/lib/request-ip";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { parseUserAgent } from "@/lib/analytics/user-agent";
import { writeBrochureEvent, type BrochureEventType } from "@/lib/analytics/brochure-events";

const VALID_EVENT_TYPES: BrochureEventType[] = ["VIEWED", "DOWNLOAD_STARTED", "DOWNLOAD_COMPLETED", "DOWNLOAD_FAILED"];

interface BrochureTrackBody {
  slug?: string;
  eventType?: string;
  referrer?: string | null;
  landingPage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/**
 * Click-triggered brochure funnel events (Download Started/Completed/Failed)
 * — called via navigator.sendBeacon from lib/track-brochure.ts so the write
 * survives the page unload/download that follows the click. VIEWED events
 * are instead recorded server-side directly on the project page render
 * (see lib/analytics/brochure-events.ts) since that's more reliable than a
 * client-fired beacon for "did they see the page at all."
 */
export async function POST(req: NextRequest) {
  let body: BrochureTrackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { slug, eventType } = body;
  if (!slug || !eventType || !VALID_EVENT_TYPES.includes(eventType as BrochureEventType)) {
    return NextResponse.json({ ok: false, error: "Invalid slug or eventType" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, builderId: true, localityId: true, microMarketId: true },
  });
  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  const [session, sessionId, ip] = await Promise.all([getPublicSession(), getOrCreateAnonSessionId(), getClientIp()]);
  const { device, browser, os } = parseUserAgent(req.headers.get("user-agent"));
  const country = req.headers.get("x-vercel-ip-country");
  const city = req.headers.get("x-vercel-ip-city");

  await writeBrochureEvent(project, eventType as BrochureEventType, {
    publicUserId: session?.userId ?? null,
    sessionId,
    ipAddress: ip === "unknown" ? null : ip,
    device,
    browser,
    os,
    country,
    city: city ? decodeURIComponent(city) : null,
    referrer: body.referrer ?? null,
    landingPage: body.landingPage ?? null,
    utmSource: body.utmSource ?? null,
    utmMedium: body.utmMedium ?? null,
    utmCampaign: body.utmCampaign ?? null,
  });

  return NextResponse.json({ ok: true });
}
