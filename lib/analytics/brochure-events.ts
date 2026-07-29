import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { getPublicSession } from "@/lib/public-auth/session";
import { peekAnonSessionId } from "./session-id";
import { parseUserAgent } from "./user-agent";

export type BrochureEventType = "VIEWED" | "DOWNLOAD_STARTED" | "DOWNLOAD_COMPLETED" | "DOWNLOAD_FAILED";

export interface BrochureEventContext {
  publicUserId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  city: string | null;
  referrer: string | null;
  landingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

interface ProjectRef {
  id: string;
  builderId: string | null;
  localityId: string | null;
  microMarketId: string | null;
}

/**
 * The one place that writes a BrochureDownloadEvent row — both the
 * Server-Component VIEWED tracker and the /api/analytics/brochure route
 * handler (click-triggered download events) funnel through this, so the
 * repeat-download check and error handling never drift apart.
 */
export async function writeBrochureEvent(project: ProjectRef, eventType: BrochureEventType, ctx: BrochureEventContext): Promise<void> {
  try {
    let isRepeat = false;
    if (eventType === "DOWNLOAD_COMPLETED") {
      const identity = ctx.publicUserId ? { publicUserId: ctx.publicUserId } : ctx.sessionId ? { sessionId: ctx.sessionId } : null;
      if (identity) {
        const priorCount = await prisma.brochureDownloadEvent.count({
          where: { projectId: project.id, eventType: "DOWNLOAD_COMPLETED", ...identity },
        });
        isRepeat = priorCount > 0;
      }
    }

    await prisma.brochureDownloadEvent.create({
      data: {
        projectId: project.id,
        builderId: project.builderId,
        localityId: project.localityId,
        microMarketId: project.microMarketId,
        eventType,
        isRepeat,
        publicUserId: ctx.publicUserId,
        sessionId: ctx.sessionId,
        ipAddress: ctx.ipAddress,
        device: ctx.device,
        browser: ctx.browser,
        os: ctx.os,
        country: ctx.country,
        city: ctx.city,
        referrer: ctx.referrer,
        landingPage: ctx.landingPage,
        utmSource: ctx.utmSource,
        utmMedium: ctx.utmMedium,
        utmCampaign: ctx.utmCampaign,
      },
    });
  } catch (error) {
    // Best-effort — analytics must never break the page/download it's describing.
    console.error("[brochure-analytics] failed to record event", eventType, project.id, error);
  }
}

/** Server-Component-safe context (read-only — cannot set the anon-session cookie if one doesn't exist yet). */
async function resolveReadOnlyContext(): Promise<BrochureEventContext> {
  const [session, sessionId, ip, h] = await Promise.all([getPublicSession(), peekAnonSessionId(), getClientIp(), headers()]);
  const { device, browser, os } = parseUserAgent(h.get("user-agent"));
  const city = h.get("x-vercel-ip-city");
  return {
    publicUserId: session?.userId ?? null,
    sessionId,
    ipAddress: ip === "unknown" ? null : ip,
    device,
    browser,
    os,
    country: h.get("x-vercel-ip-country"),
    city: city ? decodeURIComponent(city) : null,
    referrer: h.get("referer"),
    landingPage: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  };
}

/** Fires a VIEWED event from the project detail page's Server Component render — reliable (always fires on page load) unlike click-based tracking. */
export async function recordBrochureViewed(project: ProjectRef): Promise<void> {
  if (!project) return;
  const ctx = await resolveReadOnlyContext();
  await writeBrochureEvent(project, "VIEWED", ctx);
}
