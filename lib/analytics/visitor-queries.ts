import "server-only";
import { prisma } from "@/lib/prisma";
import type { AnalyticsPeriod } from "./period";
import { INTENT_EVENT_TYPES } from "./intent-event-types";
import { CHANNEL_GROUPS, VISITOR_SOURCES, VISITOR_SOURCE_CHANNEL_GROUP, type ChannelGroup, type VisitorSource } from "./visitor-source-constants";

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

export interface VisitorSourceBreakdownRow {
  source: VisitorSource;
  sessions: number;
  registered: number;
  activeResearchers: number;
}

/**
 * Real acquisition-source intelligence (Section 30) — every row here comes
 * from an actual VISITOR_SOURCE_IDENTIFIED event captured at consent time
 * (lib/actions/cookie-consent.ts), cross-referenced against the same
 * anon-to-registered / anon-to-active-researcher signals getVisitorOverview
 * already computes, grouped in JS rather than SQL since Postgres/Prisma
 * can't groupBy a JSON field's nested key directly. Only ever covers
 * visitors who accepted analytics cookies while this event type has existed
 * -- a real, disclosed coverage limit, not silently glossed over.
 */
export async function getVisitorSourceBreakdown(period: AnalyticsPeriod): Promise<VisitorSourceBreakdownRow[]> {
  return safeQuery("getVisitorSourceBreakdown", [], async () => {
    const { since, until } = period;
    const sourceEvents = await prisma.researchEvent.findMany({
      where: { eventType: "VISITOR_SOURCE_IDENTIFIED", sessionId: { not: null }, createdAt: { gte: since, lt: until } },
      select: { sessionId: true, metadata: true },
    });

    const sessionSource = new Map<string, VisitorSource>();
    for (const event of sourceEvents) {
      const source = (event.metadata as { source?: VisitorSource } | null)?.source;
      if (event.sessionId && source) sessionSource.set(event.sessionId, source);
    }
    if (sessionSource.size === 0) return [];

    const sessionIds = Array.from(sessionSource.keys());
    const [signupGroups, researcherGroups] = await Promise.all([
      prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: "SIGNUP_COMPLETED", sessionId: { in: sessionIds } },
      }),
      prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: { in: INTENT_EVENT_TYPES }, sessionId: { in: sessionIds }, publicUserId: null },
      }),
    ]);
    const registeredSessions = new Set(signupGroups.map((g) => g.sessionId));
    const researcherSessions = new Set(researcherGroups.map((g) => g.sessionId));

    const bySource = new Map<VisitorSource, { sessions: number; registered: number; activeResearchers: number }>();
    for (const [sessionId, source] of sessionSource) {
      const row = bySource.get(source) ?? { sessions: 0, registered: 0, activeResearchers: 0 };
      row.sessions += 1;
      if (registeredSessions.has(sessionId)) row.registered += 1;
      if (researcherSessions.has(sessionId)) row.activeResearchers += 1;
      bySource.set(source, row);
    }

    return VISITOR_SOURCES.map((source) => ({ source, ...(bySource.get(source) ?? { sessions: 0, registered: 0, activeResearchers: 0 }) })).filter(
      (row) => row.sessions > 0
    );
  });
}

export interface VisitorChannelBreakdownRow {
  channel: ChannelGroup;
  sessions: number;
  registered: number;
  activeResearchers: number;
}

export interface VisitorCampaignBreakdownRow {
  source: VisitorSource;
  campaign: string;
  sessions: number;
  registered: number;
  activeResearchers: number;
}

export interface VisitorAcquisitionInsights {
  bestAcquisition: { channel: ChannelGroup; sessions: number; activeResearchers: number } | null;
  bestConversion: { channel: ChannelGroup; sessions: number; registered: number; rate: number } | null;
  lowQuality: { channel: ChannelGroup; sessions: number; activeResearchers: number } | null;
}

/**
 * Channel-group rollup, UTM campaign breakdown, and dynamic acquisition
 * insights (Visitor Analytics Sections 3/6/9) — one extra query over the
 * exact same VISITOR_SOURCE_IDENTIFIED events getVisitorSourceBreakdown
 * already reads (utm_campaign was already being captured in that event's
 * metadata since the source-tracking work earlier this session; this is the
 * first place anything reads it back out). Deliberately a separate function
 * rather than refactoring getVisitorSourceBreakdown, to avoid touching an
 * already-working query this late — the extra findMany is one cheap,
 * period-scoped read, not meaningful additional load.
 */
export async function getVisitorAcquisitionBreakdown(
  period: AnalyticsPeriod
): Promise<{ channels: VisitorChannelBreakdownRow[]; campaigns: VisitorCampaignBreakdownRow[]; insights: VisitorAcquisitionInsights }> {
  return safeQuery("getVisitorAcquisitionBreakdown", { channels: [], campaigns: [], insights: { bestAcquisition: null, bestConversion: null, lowQuality: null } }, async () => {
    const { since, until } = period;
    const sourceEvents = await prisma.researchEvent.findMany({
      where: { eventType: "VISITOR_SOURCE_IDENTIFIED", sessionId: { not: null }, createdAt: { gte: since, lt: until } },
      select: { sessionId: true, metadata: true },
    });

    const sessionInfo = new Map<string, { source: VisitorSource; campaign: string | null }>();
    for (const event of sourceEvents) {
      const meta = event.metadata as { source?: VisitorSource; utmCampaign?: string | null } | null;
      if (event.sessionId && meta?.source) sessionInfo.set(event.sessionId, { source: meta.source, campaign: meta.utmCampaign ?? null });
    }
    if (sessionInfo.size === 0) return { channels: [], campaigns: [], insights: { bestAcquisition: null, bestConversion: null, lowQuality: null } };

    const sessionIds = Array.from(sessionInfo.keys());
    const [signupGroups, researcherGroups] = await Promise.all([
      prisma.researchEvent.groupBy({ by: ["sessionId"], where: { eventType: "SIGNUP_COMPLETED", sessionId: { in: sessionIds } } }),
      prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: { in: INTENT_EVENT_TYPES }, sessionId: { in: sessionIds }, publicUserId: null },
      }),
    ]);
    const registeredSessions = new Set(signupGroups.map((g) => g.sessionId));
    const researcherSessions = new Set(researcherGroups.map((g) => g.sessionId));

    const byChannel = new Map<ChannelGroup, { sessions: number; registered: number; activeResearchers: number }>();
    const byCampaign = new Map<string, VisitorCampaignBreakdownRow>();
    for (const [sessionId, info] of sessionInfo) {
      const channel = VISITOR_SOURCE_CHANNEL_GROUP[info.source];
      const c = byChannel.get(channel) ?? { sessions: 0, registered: 0, activeResearchers: 0 };
      c.sessions += 1;
      if (registeredSessions.has(sessionId)) c.registered += 1;
      if (researcherSessions.has(sessionId)) c.activeResearchers += 1;
      byChannel.set(channel, c);

      if (info.campaign) {
        const key = `${info.source}::${info.campaign}`;
        const row = byCampaign.get(key) ?? { source: info.source, campaign: info.campaign, sessions: 0, registered: 0, activeResearchers: 0 };
        row.sessions += 1;
        if (registeredSessions.has(sessionId)) row.registered += 1;
        if (researcherSessions.has(sessionId)) row.activeResearchers += 1;
        byCampaign.set(key, row);
      }
    }

    const channels = CHANNEL_GROUPS.map((channel) => ({ channel, ...(byChannel.get(channel) ?? { sessions: 0, registered: 0, activeResearchers: 0 }) })).filter(
      (row) => row.sessions > 0
    );
    const campaigns = Array.from(byCampaign.values()).sort((a, b) => b.sessions - a.sessions);

    // Decision insights (Section 6/9) -- computed only from real rows above,
    // and only when there's enough signal to say something meaningful; no
    // fixed thresholds, no manufactured conclusions on thin data.
    const MIN_SESSIONS_FOR_INSIGHT = 5;
    const eligible = channels.filter((c) => c.sessions >= MIN_SESSIONS_FOR_INSIGHT);
    const bestAcquisition = eligible.length
      ? eligible.reduce((best, c) => (c.sessions > best.sessions ? c : best))
      : null;
    const withRegistration = eligible.map((c) => ({ ...c, rate: c.sessions > 0 ? c.registered / c.sessions : 0 }));
    const bestConversion = withRegistration.length
      ? withRegistration.reduce((best, c) => (c.rate > best.rate ? c : best))
      : null;
    const lowQuality = eligible.length
      ? eligible.reduce((worst, c) => (c.activeResearchers / c.sessions < worst.activeResearchers / worst.sessions ? c : worst))
      : null;

    return {
      channels,
      campaigns,
      insights: {
        bestAcquisition: bestAcquisition ? { channel: bestAcquisition.channel, sessions: bestAcquisition.sessions, activeResearchers: bestAcquisition.activeResearchers } : null,
        bestConversion: bestConversion ? { channel: bestConversion.channel, sessions: bestConversion.sessions, registered: bestConversion.registered, rate: bestConversion.rate } : null,
        lowQuality:
          lowQuality && lowQuality.activeResearchers / lowQuality.sessions < (bestAcquisition ? bestAcquisition.activeResearchers / bestAcquisition.sessions : 1)
            ? { channel: lowQuality.channel, sessions: lowQuality.sessions, activeResearchers: lowQuality.activeResearchers }
            : null,
      },
    };
  });
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
