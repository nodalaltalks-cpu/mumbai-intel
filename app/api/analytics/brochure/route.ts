import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { getClientIp } from "@/lib/request-ip";
import { getOrCreateAnonSessionId } from "@/lib/analytics/session-id";
import { parseUserAgent } from "@/lib/analytics/user-agent";
import { writeBrochureEvent, type BrochureEventType } from "@/lib/analytics/brochure-events";
import { sendBrochureDownloadEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

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
  // Unauthenticated (anonymous browsing is tracked too) — rate-limited by IP so this
  // sendBeacon-fired endpoint can't be scripted into a write/email-sending amplification loop.
  const rateLimitIp = await getClientIp();
  const rateLimit = checkRateLimit(`analytics-brochure:${rateLimitIp}`, 60, 60);
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

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
    select: { id: true, name: true, slug: true, brochureUrl: true, builderId: true, localityId: true, microMarketId: true },
  });
  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  const [session, sessionId] = await Promise.all([getPublicSession(), getOrCreateAnonSessionId()]);
  const ip = rateLimitIp;
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

  // Best-effort confirmation email, signed-in users only (guests have no
  // address to send to — and a guest hitting this route at all would mean
  // the gating in lib/premium/mask.ts was somehow bypassed, since a locked
  // brochureUrl is null before it ever reaches the client). Never let an
  // email hiccup affect the tracking response the client is waiting on.
  if (session?.email && project.brochureUrl && eventType === "DOWNLOAD_COMPLETED") {
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
    try {
      await sendBrochureDownloadEmail(session.email, {
        projectName: project.name,
        projectUrl: `${siteUrl}/projects/${project.slug}`,
        brochureUrl: project.brochureUrl,
      });
    } catch (error) {
      console.error("[email] failed to send brochure download email:", error);
    }
  }

  return NextResponse.json({ ok: true });
}
