import "server-only";
import { prisma } from "@/lib/prisma";
import type { AnalyticsPeriod } from "./period";
import { INTENT_EVENT_TYPES } from "./intent-event-types";

/**
 * Founder-visible visitor aggregates — reads ONLY the existing ResearchEvent
 * log (sessionId/publicUserId, already written by every anonymous and
 * signed-in interaction). No new tracking table, no raw cookie values ever
 * surfaced (Section 4) — every number here is a count of distinct anonymous
 * sessions, never an individual visitor's identity.
 */

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[visitor-queries] ${label} failed:`, error);
    return fallback;
  }
}

export interface VisitorOverview {
  anonymousVisitors: number;
  previousAnonymousVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  anonymousToRegistered: number;
  anonymousToActiveResearcher: number;
}

/** Distinct, non-null session ids with >=1 ResearchEvent in [since, until). */
async function distinctSessionsInWindow(since: Date, until: Date, extraWhere: object = {}): Promise<string[]> {
  const groups = await prisma.researchEvent.groupBy({
    by: ["sessionId"],
    where: { sessionId: { not: null }, createdAt: { gte: since, lt: until }, ...extraWhere },
  });
  return groups.map((g) => g.sessionId as string);
}

export async function getVisitorOverview(period: AnalyticsPeriod): Promise<VisitorOverview> {
  return safeQuery(
    "getVisitorOverview",
    { anonymousVisitors: 0, previousAnonymousVisitors: 0, newVisitors: 0, returningVisitors: 0, anonymousToRegistered: 0, anonymousToActiveResearcher: 0 },
    async () => {
      const { since, until, previousSince, previousUntil } = period;

      const [activeSessionIds, previousActiveGroups, signupGroups, researcherGroups] = await Promise.all([
        distinctSessionsInWindow(since, until, { publicUserId: null }),
        prisma.researchEvent.groupBy({
          by: ["sessionId"],
          where: { sessionId: { not: null }, publicUserId: null, createdAt: { gte: previousSince, lt: previousUntil } },
        }),
        // A session that later signed up still shows the SIGNUP_COMPLETED row with both
        // publicUserId and sessionId set (recordResearchEvent writes both on the same row) --
        // that's the anon-to-registered bridge, no separate linking table needed.
        prisma.researchEvent.groupBy({
          by: ["sessionId"],
          where: { eventType: "SIGNUP_COMPLETED", sessionId: { not: null }, createdAt: { gte: since, lt: until } },
        }),
        prisma.researchEvent.groupBy({
          by: ["sessionId"],
          where: { eventType: { in: INTENT_EVENT_TYPES }, sessionId: { not: null }, publicUserId: null, createdAt: { gte: since, lt: until } },
        }),
      ]);

      const anonymousVisitors = activeSessionIds.length;
      const previousAnonymousVisitors = previousActiveGroups.length;

      // New vs. returning: for the sessions active in this period, was their
      // globally-earliest event before this period started? Bounded to just
      // those session ids (not a full-table scan) via the `in` filter below.
      let returningVisitors = 0;
      if (activeSessionIds.length > 0) {
        const earliestPerSession = await prisma.researchEvent.groupBy({
          by: ["sessionId"],
          where: { sessionId: { in: activeSessionIds } },
          _min: { createdAt: true },
        });
        returningVisitors = earliestPerSession.filter((g) => g._min.createdAt !== null && g._min.createdAt < since).length;
      }
      const newVisitors = anonymousVisitors - returningVisitors;

      return {
        anonymousVisitors,
        previousAnonymousVisitors,
        newVisitors,
        returningVisitors,
        anonymousToRegistered: signupGroups.length,
        anonymousToActiveResearcher: researcherGroups.length,
      };
    }
  );
}
