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
    const [session, peekedSessionId] = await Promise.all([getPublicSession(), peekAnonSessionId()]);
    await prisma.researchEvent.create({
      data: {
        eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        publicUserId: session?.userId ?? null,
        sessionId: input.sessionId !== undefined ? input.sessionId : peekedSessionId,
        metadata: input.metadata ? (input.metadata as object) : undefined,
        resultCount: input.resultCount,
      },
    });
  } catch (error) {
    console.error("[research-analytics] failed to record event", eventType, error);
  }
}
