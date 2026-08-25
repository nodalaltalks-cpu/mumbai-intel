import "server-only";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { peekAnonSessionId } from "./session-id";
import type { ResearchEventType } from "@prisma/client";

export interface ResearchEventInput {
  entityType?: "Project" | "Builder" | "Locality" | "Transaction" | "PublicUser";
  entityId?: string;
  /** Small, non-PII context — a search query string, a list of active filter keys. Never raw contact details. */
  metadata?: Record<string, unknown>;
  /** SEARCH_PERFORMED/TRANSACTION_SEARCHED only — how many rows the search actually matched, so zero-result searches are queryable. */
  resultCount?: number;
  /**
   * Only set by app/api/analytics/research/route.ts, which can write the
   * anon-session cookie (getOrCreateAnonSessionId) unlike a Server Component
   * render — passed through here so there's still exactly one write path.
   */
  sessionId?: string | null;
  /**
   * Only set by callers writing from inside Next's `after()` (e.g.
   * lib/recommendations/impressions.ts) — `cookies()`, and therefore
   * getPublicSession(), is not callable inside an `after()` callback
   * (Next.js throws "used cookies() inside after()"). Such callers resolve
   * the session BEFORE scheduling the callback and pass the id through
   * here, same reasoning as sessionId above.
   */
  publicUserId?: string | null;
}

/**
 * The one place a ResearchEvent row is ever written — mirrors
 * lib/analytics/brochure-events.ts's writeBrochureEvent shape (same
 * identity model: publicUserId when signed in, otherwise the existing
 * anonymous session cookie), deliberately without that file's device/
 * browser/UTM richness, since none of these research-intent signals need
 * it. Best-effort: analytics must never break the page it's describing.
 */
export async function recordResearchEvent(eventType: ResearchEventType, input: ResearchEventInput = {}): Promise<void> {
  try {
    // Skip both cookie reads entirely when the caller already resolved both
    // identities (the after()-callback case) -- cookies() throws in that
    // context, so it must never be reached at all, not just have its result overridden.
    const needsSession = input.publicUserId === undefined;
    const needsSessionId = input.sessionId === undefined;
    const [session, peekedSessionId] = await Promise.all([
      needsSession ? getPublicSession() : Promise.resolve(null),
      needsSessionId ? peekAnonSessionId() : Promise.resolve(null),
    ]);
    await prisma.researchEvent.create({
      data: {
        eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        publicUserId: needsSession ? (session?.userId ?? null) : input.publicUserId,
        sessionId: needsSessionId ? peekedSessionId : input.sessionId,
        metadata: input.metadata ? (input.metadata as object) : undefined,
        resultCount: input.resultCount,
      },
    });
  } catch (error) {
    console.error("[research-analytics] failed to record event", eventType, error);
  }
}
