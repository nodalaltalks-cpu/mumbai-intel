import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResearchEventType } from "@prisma/client";
import type { AnalyticsPeriod } from "./period";
import { INTENT_EVENT_TYPES } from "./intent-event-types";
import { VISITOR_SOURCES, type VisitorSource } from "./visitor-source-constants";
import { getTrendingSearches } from "./search-queries";

/**
 * Phase 3B — the remaining Visitor Intelligence gaps (Parts 5-13 of the
 * spec), built entirely on the same VISITOR_SOURCE_IDENTIFIED /
 * ResearchEvent rows lib/analytics/visitor-queries.ts already reads. Kept
 * in its own file rather than growing visitor-queries.ts further, matching
 * this codebase's own established pattern of "a separate function rather
 * than refactoring an already-working query this late" (see that file's
 * getVisitorAcquisitionBreakdown comment).
 *
 * Every function here shares the same disclosed coverage limit as the rest
 * of visitor-queries.ts: only sessions that (a) accepted analytics cookies
 * and (b) did so after this event existed are represented. Device/geo/
 * landing-page fields specifically are only present on VISITOR_SOURCE_IDENTIFIED
 * rows written after the Phase 3B metadata extension shipped — sessions
 * captured before that still have `source` but not `device`/`country`/etc.,
 * so those breakdowns will under-count relative to the source breakdown
 * until enough new sessions accumulate. Never backfilled or estimated.
 */

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[visitor-intelligence] ${label} failed:`, error);
    return fallback;
  }
}

export interface SourceSessionInfo {
  source: VisitorSource;
  device: string | null;
  os: string | null;
  browser: string | null;
  country: string | null;
  /** ISO 3166-2 region/state code (e.g. "MH", "CA") from Vercel's edge geo header — Phase 3C. */
  region: string | null;
  city: string | null;
  landingPath: string | null;
}

/**
 * The one shared read of VISITOR_SOURCE_IDENTIFIED rows for a period —
 * every function below builds on this instead of re-querying it. Exported
 * so lib/recommendations/source-intelligence.ts (Part 14/16 — recommendation
 * performance crossed with acquisition source) can reuse the exact same
 * session→source map rather than re-deriving it.
 */
export async function loadSessionSourceMap(period: AnalyticsPeriod): Promise<Map<string, SourceSessionInfo>> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType: "VISITOR_SOURCE_IDENTIFIED", sessionId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
    select: { sessionId: true, metadata: true },
  });
  const map = new Map<string, SourceSessionInfo>();
  for (const row of rows) {
    const meta = row.metadata as Partial<SourceSessionInfo> & { source?: VisitorSource } | null;
    if (row.sessionId && meta?.source) {
      map.set(row.sessionId, {
        source: meta.source,
        device: meta.device ?? null,
        os: meta.os ?? null,
        browser: meta.browser ?? null,
        country: meta.country ?? null,
        region: meta.region ?? null,
        city: meta.city ?? null,
        landingPath: meta.landingPath ?? null,
      });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────
// Part 5 — Channel quality: registration / research / project-view / save /
// compare / contact / return rate per source, not just volume.
// ─────────────────────────────────────────────────────────────────────────

export interface ChannelQualityRow {
  source: VisitorSource;
  sessions: number;
  registrationRate: number | null;
  researchRate: number | null;
  projectViewRate: number | null;
  saveRate: number | null;
  compareRate: number | null;
  contactRate: number | null;
  returnRate: number | null;
}

const SAVE_EVENT_TYPES: ResearchEventType[] = ["WISHLIST_ADDED"];
const COMPARE_EVENT_TYPES: ResearchEventType[] = ["COMPARE_USED"];
const CONTACT_EVENT_TYPES: ResearchEventType[] = ["CONTACT_ENQUIRY_SUBMITTED"];
const PROJECT_VIEW_EVENT_TYPES: ResearchEventType[] = ["PROJECT_VIEWED"];

export async function getChannelQualityBreakdown(period: AnalyticsPeriod): Promise<ChannelQualityRow[]> {
  return safeQuery("getChannelQualityBreakdown", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return [];
    const sessionIds = Array.from(sessionSource.keys());

    async function sessionsWith(eventTypes: ResearchEventType[]): Promise<Set<string>> {
      const groups = await prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: { in: eventTypes }, sessionId: { in: sessionIds }, createdAt: { gte: period.since, lt: period.until } },
      });
      return new Set(groups.map((g) => g.sessionId as string));
    }

    const [registered, researched, viewed, saved, compared, contacted, earliestPerSession] = await Promise.all([
      sessionsWith(["SIGNUP_COMPLETED"]),
      sessionsWith(INTENT_EVENT_TYPES),
      sessionsWith(PROJECT_VIEW_EVENT_TYPES),
      sessionsWith(SAVE_EVENT_TYPES),
      sessionsWith(COMPARE_EVENT_TYPES),
      sessionsWith(CONTACT_EVENT_TYPES),
      prisma.researchEvent.groupBy({ by: ["sessionId"], where: { sessionId: { in: sessionIds } }, _min: { createdAt: true } }),
    ]);
    const returning = new Set(
      earliestPerSession.filter((g) => g._min.createdAt !== null && g._min.createdAt < period.since).map((g) => g.sessionId as string)
    );

    const bySource = new Map<VisitorSource, { sessions: string[] }>();
    for (const [sessionId, info] of sessionSource) {
      const row = bySource.get(info.source) ?? { sessions: [] };
      row.sessions.push(sessionId);
      bySource.set(info.source, row);
    }

    const rate = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : null);

    return VISITOR_SOURCES.map((source) => {
      const ids = bySource.get(source)?.sessions ?? [];
      const total = ids.length;
      if (total === 0) return null;
      const countIn = (set: Set<string>) => ids.filter((id) => set.has(id)).length;
      return {
        source,
        sessions: total,
        registrationRate: rate(countIn(registered), total),
        researchRate: rate(countIn(researched), total),
        projectViewRate: rate(countIn(viewed), total),
        saveRate: rate(countIn(saved), total),
        compareRate: rate(countIn(compared), total),
        contactRate: rate(countIn(contacted), total),
        returnRate: rate(countIn(returning), total),
      };
    }).filter((row): row is ChannelQualityRow => row !== null);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Part 6 — Landing page analytics. Bucketed by path prefix into the
// page-type groups the spec names. Bounce/exit rate is deliberately NOT
// computed here: not every page in this app fires a ResearchEvent (static
// pages like /faq, /privacy, /cookie-policy fire nothing at all), so "zero
// further events after arrival" cannot be reliably distinguished from
// "visited an untracked page and left satisfied" — showing a number here
// would be exactly the fabricated bounce rate the spec explicitly forbids.
// ─────────────────────────────────────────────────────────────────────────

export type LandingPageBucket = "Homepage" | "Project pages" | "Transaction pages" | "Locality pages" | "Builder pages" | "Other public pages";

function bucketLandingPath(path: string): LandingPageBucket {
  if (path === "/") return "Homepage";
  if (path.startsWith("/projects")) return "Project pages";
  if (path.startsWith("/transactions")) return "Transaction pages";
  if (path.startsWith("/localities")) return "Locality pages";
  if (path.startsWith("/builders")) return "Builder pages";
  return "Other public pages";
}

export interface LandingPageRow {
  bucket: LandingPageBucket;
  sessions: number;
  registrationRate: number | null;
  researchRate: number | null;
  contactRate: number | null;
}

export async function getLandingPageBreakdown(period: AnalyticsPeriod): Promise<LandingPageRow[]> {
  return safeQuery("getLandingPageBreakdown", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    const withLanding = Array.from(sessionSource.entries()).filter(([, info]) => info.landingPath !== null);
    if (withLanding.length === 0) return [];
    const sessionIds = withLanding.map(([id]) => id);

    async function sessionsWith(eventTypes: ResearchEventType[]): Promise<Set<string>> {
      const groups = await prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: { in: eventTypes }, sessionId: { in: sessionIds }, createdAt: { gte: period.since, lt: period.until } },
      });
      return new Set(groups.map((g) => g.sessionId as string));
    }
    const [registered, researched, contacted] = await Promise.all([
      sessionsWith(["SIGNUP_COMPLETED"]),
      sessionsWith(INTENT_EVENT_TYPES),
      sessionsWith(CONTACT_EVENT_TYPES),
    ]);

    const byBucket = new Map<LandingPageBucket, string[]>();
    for (const [sessionId, info] of withLanding) {
      const bucket = bucketLandingPath(info.landingPath as string);
      const list = byBucket.get(bucket) ?? [];
      list.push(sessionId);
      byBucket.set(bucket, list);
    }

    const rate = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : null);
    return Array.from(byBucket.entries())
      .map(([bucket, ids]) => ({
        bucket,
        sessions: ids.length,
        registrationRate: rate(ids.filter((id) => registered.has(id)).length, ids.length),
        researchRate: rate(ids.filter((id) => researched.has(id)).length, ids.length),
        contactRate: rate(ids.filter((id) => contacted.has(id)).length, ids.length),
      }))
      .sort((a, b) => b.sessions - a.sessions);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Part 7 — Search intent by source. Reuses search-queries.ts's own query
// pattern (SEARCH_PERFORMED/TRANSACTION_SEARCHED, metadata.query) rather
// than a second search-analytics implementation — this just additionally
// selects sessionId (which that file's exports don't) to cross-reference
// against the known-source session map.
// ─────────────────────────────────────────────────────────────────────────

export interface SearchBySourceRow {
  source: VisitorSource;
  topQueries: { query: string; count: number }[];
}

const SEARCH_EVENT_TYPES: ResearchEventType[] = ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED"];

export async function getSearchIntentBySource(period: AnalyticsPeriod, queriesPerSource = 5): Promise<SearchBySourceRow[]> {
  return safeQuery("getSearchIntentBySource", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return [];

    const searches = await prisma.researchEvent.findMany({
      where: { eventType: { in: SEARCH_EVENT_TYPES }, sessionId: { in: Array.from(sessionSource.keys()) }, createdAt: { gte: period.since, lt: period.until } },
      select: { sessionId: true, metadata: true },
    });
    if (searches.length === 0) return [];

    const bySource = new Map<VisitorSource, Map<string, number>>();
    for (const row of searches) {
      const source = row.sessionId ? sessionSource.get(row.sessionId)?.source : undefined;
      if (!source) continue;
      const q = (row.metadata as { query?: unknown } | null)?.query;
      if (typeof q !== "string" || !q.trim()) continue;
      const key = q.trim().toLowerCase();
      const counts = bySource.get(source) ?? new Map<string, number>();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      bySource.set(source, counts);
    }

    return Array.from(bySource.entries())
      .map(([source, counts]) => ({
        source,
        topQueries: Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, queriesPerSource)
          .map(([query, count]) => ({ query, count })),
      }))
      .filter((row) => row.topQueries.length > 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Part 8 — Anonymous → registered journey, as a real step funnel. "Profile
// interaction" is scoped to the guided-completion events (PROFILE_STARTED/
// PROFILE_FIELD_COMPLETED) which only exist post-signup in this app (an
// anonymous visitor has no profile to interact with before registering) —
// placed after Registered rather than before it, matching how the product
// actually works, not the spec's literal diagram order.
// ─────────────────────────────────────────────────────────────────────────

export interface AnonymousJourneyFunnel {
  anonymousVisitors: number;
  searchedOrBrowsed: number;
  registered: number;
  completedProfileStep: number;
  savedOrCompared: number;
  contacted: number;
}

export async function getAnonymousJourneyFunnel(period: AnalyticsPeriod): Promise<AnonymousJourneyFunnel> {
  return safeQuery(
    "getAnonymousJourneyFunnel",
    { anonymousVisitors: 0, searchedOrBrowsed: 0, registered: 0, completedProfileStep: 0, savedOrCompared: 0, contacted: 0 },
    async () => {
      const anonGroups = await prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { sessionId: { not: null }, publicUserId: null, createdAt: { gte: period.since, lt: period.until } },
      });
      const anonSessionIds = anonGroups.map((g) => g.sessionId as string);
      if (anonSessionIds.length === 0) return { anonymousVisitors: 0, searchedOrBrowsed: 0, registered: 0, completedProfileStep: 0, savedOrCompared: 0, contacted: 0 };

      const [researchedGroups, signupGroups] = await Promise.all([
        prisma.researchEvent.groupBy({
          by: ["sessionId"],
          where: { eventType: { in: INTENT_EVENT_TYPES }, sessionId: { in: anonSessionIds }, publicUserId: null, createdAt: { gte: period.since, lt: period.until } },
        }),
        prisma.researchEvent.groupBy({
          by: ["sessionId", "publicUserId"],
          where: { eventType: "SIGNUP_COMPLETED", sessionId: { in: anonSessionIds }, createdAt: { gte: period.since, lt: period.until } },
        }),
      ]);
      const registeredUserIds = signupGroups.map((g) => g.publicUserId).filter((id): id is string => id !== null);

      const [profileStepGroups, savedCompareGroups, contactGroups] = registeredUserIds.length
        ? await Promise.all([
            prisma.researchEvent.groupBy({
              by: ["publicUserId"],
              where: { eventType: { in: ["PROFILE_STARTED", "PROFILE_FIELD_COMPLETED"] }, publicUserId: { in: registeredUserIds }, createdAt: { gte: period.since, lt: period.until } },
            }),
            prisma.researchEvent.groupBy({
              by: ["publicUserId"],
              where: { eventType: { in: [...SAVE_EVENT_TYPES, ...COMPARE_EVENT_TYPES] }, publicUserId: { in: registeredUserIds }, createdAt: { gte: period.since, lt: period.until } },
            }),
            prisma.researchEvent.groupBy({
              by: ["publicUserId"],
              where: { eventType: { in: CONTACT_EVENT_TYPES }, publicUserId: { in: registeredUserIds }, createdAt: { gte: period.since, lt: period.until } },
            }),
          ])
        : [[], [], []];

      return {
        anonymousVisitors: anonSessionIds.length,
        searchedOrBrowsed: researchedGroups.length,
        registered: registeredUserIds.length,
        completedProfileStep: profileStepGroups.length,
        savedOrCompared: savedCompareGroups.length,
        contacted: contactGroups.length,
      };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Part 9 — Returning visitors: return rate + one real repeat-research
// example (never a fabricated narrative), reusing the same "earliest event
// before this period" definition getVisitorOverview already established.
// ─────────────────────────────────────────────────────────────────────────

export interface ReturningVisitorExample {
  sessionSource: VisitorSource | null;
  daysSinceFirstSeen: number;
  projectsViewedAgain: number;
  didCompareAgain: boolean;
}

export interface ReturningVisitorInsights {
  repeatResearchSessions: number; // returning sessions that re-viewed a project they'd already viewed before
  example: ReturningVisitorExample | null;
}

export async function getReturningVisitorInsights(period: AnalyticsPeriod): Promise<ReturningVisitorInsights> {
  return safeQuery("getReturningVisitorInsights", { repeatResearchSessions: 0, example: null }, async () => {
    const activeGroups = await prisma.researchEvent.groupBy({
      by: ["sessionId"],
      where: { sessionId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
    });
    const activeSessionIds = activeGroups.map((g) => g.sessionId as string);
    if (activeSessionIds.length === 0) return { repeatResearchSessions: 0, example: null };

    const earliestPerSession = await prisma.researchEvent.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: activeSessionIds } },
      _min: { createdAt: true },
    });
    const returningSessions = earliestPerSession.filter((g) => g._min.createdAt !== null && g._min.createdAt < period.since);
    if (returningSessions.length === 0) return { repeatResearchSessions: 0, example: null };
    const returningIds = returningSessions.map((g) => g.sessionId as string);

    // All PROJECT_VIEWED rows ever, for these sessions, to detect a repeat view (same entityId, one occurrence before this period, one inside it).
    const views = await prisma.researchEvent.findMany({
      where: { eventType: "PROJECT_VIEWED", sessionId: { in: returningIds }, entityId: { not: null } },
      select: { sessionId: true, entityId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const compares = await prisma.researchEvent.groupBy({
      by: ["sessionId"],
      where: { eventType: "COMPARE_USED", sessionId: { in: returningIds }, createdAt: { gte: period.since, lt: period.until } },
    });
    const compareSessionIds = new Set(compares.map((c) => c.sessionId as string));

    const viewsBySession = new Map<string, { entityId: string; createdAt: Date }[]>();
    for (const v of views) {
      if (!v.sessionId || !v.entityId) continue;
      const list = viewsBySession.get(v.sessionId) ?? [];
      list.push({ entityId: v.entityId, createdAt: v.createdAt });
      viewsBySession.set(v.sessionId, list);
    }

    let repeatResearchSessions = 0;
    let example: ReturningVisitorExample | null = null;
    for (const sessionId of returningIds) {
      const sessionViews = viewsBySession.get(sessionId) ?? [];
      const beforePeriod = new Set(sessionViews.filter((v) => v.createdAt < period.since).map((v) => v.entityId));
      const inPeriodRepeats = sessionViews.filter((v) => v.createdAt >= period.since && beforePeriod.has(v.entityId));
      const repeatCount = new Set(inPeriodRepeats.map((v) => v.entityId)).size;
      if (repeatCount > 0) {
        repeatResearchSessions++;
        if (!example) {
          const firstSeen = returningSessions.find((g) => g.sessionId === sessionId)?._min.createdAt;
          const daysSince = firstSeen ? Math.round((period.since.getTime() - firstSeen.getTime()) / 86_400_000) : 0;
          const sourceRow = await prisma.researchEvent.findFirst({
            where: { eventType: "VISITOR_SOURCE_IDENTIFIED", sessionId },
            select: { metadata: true },
          });
          example = {
            sessionSource: (sourceRow?.metadata as { source?: VisitorSource } | null)?.source ?? null,
            daysSinceFirstSeen: Math.max(daysSince, 0),
            projectsViewedAgain: repeatCount,
            didCompareAgain: compareSessionIds.has(sessionId),
          };
        }
      }
    }

    return { repeatResearchSessions, example };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Parts 10/11 — Device and coarse geography, read from the same
// VISITOR_SOURCE_IDENTIFIED metadata (device/os/browser via User-Agent
// parsing, country/city via Vercel's first-party edge geo headers — no
// third-party geo-IP lookup, no precise coordinates, no fingerprinting).
// ─────────────────────────────────────────────────────────────────────────

export interface DeviceBreakdown {
  byDevice: { label: string; count: number; percent: number }[];
  byOs: { label: string; count: number; percent: number }[];
  byBrowser: { label: string; count: number; percent: number }[];
  coveredSessions: number;
}

export async function getDeviceBreakdown(period: AnalyticsPeriod): Promise<DeviceBreakdown> {
  return safeQuery("getDeviceBreakdown", { byDevice: [], byOs: [], byBrowser: [], coveredSessions: 0 }, async () => {
    const sessionSource = await loadSessionSourceMap(period);
    const withDevice = Array.from(sessionSource.values()).filter((info) => info.device !== null);
    if (withDevice.length === 0) return { byDevice: [], byOs: [], byBrowser: [], coveredSessions: 0 };

    function tally(pick: (i: SourceSessionInfo) => string | null) {
      const counts = new Map<string, number>();
      for (const info of withDevice) {
        const v = pick(info) ?? "Unknown";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const total = withDevice.length;
      return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 1000) / 10 }))
        .sort((a, b) => b.count - a.count);
    }

    return {
      byDevice: tally((i) => i.device),
      byOs: tally((i) => i.os),
      byBrowser: tally((i) => i.browser),
      coveredSessions: withDevice.length,
    };
  });
}

export interface GeoBreakdown {
  byCountry: { label: string; count: number; percent: number }[];
  /** Region/state rows -- label is "Region, Country" since the same region code can recur across countries (e.g. two different "CA"s is unlikely here but not guaranteed). */
  byRegion: { label: string; count: number; percent: number }[];
  byCity: { label: string; count: number; percent: number }[];
  coveredSessions: number;
}

export async function getGeoBreakdown(period: AnalyticsPeriod): Promise<GeoBreakdown> {
  return safeQuery("getGeoBreakdown", { byCountry: [], byRegion: [], byCity: [], coveredSessions: 0 }, async () => {
    const sessionSource = await loadSessionSourceMap(period);
    const withGeo = Array.from(sessionSource.values()).filter((info) => info.country !== null);
    if (withGeo.length === 0) return { byCountry: [], byRegion: [], byCity: [], coveredSessions: 0 };

    function tally(pick: (i: SourceSessionInfo) => string | null) {
      const counts = new Map<string, number>();
      for (const info of withGeo) {
        const v = pick(info) ?? "Unknown";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const total = withGeo.length;
      return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 1000) / 10 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    return {
      byCountry: tally((i) => i.country),
      byRegion: tally((i) => (i.region ? `${i.region}, ${i.country}` : null)),
      byCity: tally((i) => i.city),
      coveredSessions: withGeo.length,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3C Part 11 -- per-location detail rows (Visitors / New / Returning /
// Registered / Researchers), the same session-cross-reference pattern
// getChannelQualityBreakdown already established, just grouped by location
// instead of by source. One shared helper powers all three granularities
// (country/region/city) so the three tables can never disagree on what
// "registered"/"researcher" means.
// ─────────────────────────────────────────────────────────────────────────

export interface GeoLocationRow {
  label: string;
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  registered: number;
  researchers: number;
}

async function getGeoLocationRows(period: AnalyticsPeriod, pick: (i: SourceSessionInfo) => string | null, limit = 10): Promise<GeoLocationRow[]> {
  const sessionSource = await loadSessionSourceMap(period);
  if (sessionSource.size === 0) return [];
  const sessionIds = Array.from(sessionSource.keys());

  async function sessionsWith(eventTypes: ResearchEventType[]): Promise<Set<string>> {
    const groups = await prisma.researchEvent.groupBy({
      by: ["sessionId"],
      where: { eventType: { in: eventTypes }, sessionId: { in: sessionIds }, createdAt: { gte: period.since, lt: period.until } },
    });
    return new Set(groups.map((g) => g.sessionId as string));
  }

  const [registered, researched, earliestPerSession] = await Promise.all([
    sessionsWith(["SIGNUP_COMPLETED"]),
    sessionsWith(INTENT_EVENT_TYPES),
    prisma.researchEvent.groupBy({ by: ["sessionId"], where: { sessionId: { in: sessionIds } }, _min: { createdAt: true } }),
  ]);
  const returning = new Set(
    earliestPerSession.filter((g) => g._min.createdAt !== null && g._min.createdAt < period.since).map((g) => g.sessionId as string)
  );

  const byLocation = new Map<string, string[]>();
  for (const [sessionId, info] of sessionSource) {
    if (info.country === null) continue; // no geo signal at all for this session
    const label = pick(info) ?? "Unknown";
    const list = byLocation.get(label) ?? [];
    list.push(sessionId);
    byLocation.set(label, list);
  }

  return Array.from(byLocation.entries())
    .map(([label, ids]) => ({
      label,
      visitors: ids.length,
      newVisitors: ids.filter((id) => !returning.has(id)).length,
      returningVisitors: ids.filter((id) => returning.has(id)).length,
      registered: ids.filter((id) => registered.has(id)).length,
      researchers: ids.filter((id) => researched.has(id)).length,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, limit);
}

export function getGeoCountryRows(period: AnalyticsPeriod): Promise<GeoLocationRow[]> {
  return safeQuery("getGeoCountryRows", [], () => getGeoLocationRows(period, (i) => i.country));
}

export function getGeoRegionRows(period: AnalyticsPeriod): Promise<GeoLocationRow[]> {
  return safeQuery("getGeoRegionRows", [], () => getGeoLocationRows(period, (i) => (i.region ? `${i.region}, ${i.country}` : null)));
}

export function getGeoCityRows(period: AnalyticsPeriod): Promise<GeoLocationRow[]> {
  return safeQuery("getGeoCityRows", [], () => getGeoLocationRows(period, (i) => i.city));
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3C Part 12 -- Geo x acquisition source: which channel brought
// visitors from each location, reusing the exact same session->source map
// as everything else in this file. Only the top locations (by volume) are
// broken down by source, and only sources with a real presence there --
// never a fabricated "0 visitors" row.
// ─────────────────────────────────────────────────────────────────────────

export interface GeoSourceRow {
  location: string;
  source: VisitorSource;
  visitors: number;
  registered: number;
  researchers: number;
}

export async function getGeoSourceBreakdown(period: AnalyticsPeriod, topLocations = 5): Promise<GeoSourceRow[]> {
  return safeQuery("getGeoSourceBreakdown", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return [];
    const sessionIds = Array.from(sessionSource.keys());

    async function sessionsWith(eventTypes: ResearchEventType[]): Promise<Set<string>> {
      const groups = await prisma.researchEvent.groupBy({
        by: ["sessionId"],
        where: { eventType: { in: eventTypes }, sessionId: { in: sessionIds }, createdAt: { gte: period.since, lt: period.until } },
      });
      return new Set(groups.map((g) => g.sessionId as string));
    }
    const [registered, researched] = await Promise.all([sessionsWith(["SIGNUP_COMPLETED"]), sessionsWith(INTENT_EVENT_TYPES)]);

    // Determine the top locations by volume first (using the city, the most
    // specific granularity the spec's own example uses: "Mumbai -> Google -> ...").
    const cityCounts = new Map<string, number>();
    for (const info of sessionSource.values()) {
      if (!info.city) continue;
      cityCounts.set(info.city, (cityCounts.get(info.city) ?? 0) + 1);
    }
    const topCities = new Set(Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topLocations).map(([c]) => c));
    if (topCities.size === 0) return [];

    const key = (city: string, source: VisitorSource) => `${city}|||${source}`;
    const grouped = new Map<string, string[]>();
    for (const [sessionId, info] of sessionSource) {
      if (!info.city || !topCities.has(info.city)) continue;
      const k = key(info.city, info.source);
      const list = grouped.get(k) ?? [];
      list.push(sessionId);
      grouped.set(k, list);
    }

    return Array.from(grouped.entries())
      .map(([k, ids]) => {
        const [location, source] = k.split("|||") as [string, VisitorSource];
        return {
          location,
          source,
          visitors: ids.length,
          registered: ids.filter((id) => registered.has(id)).length,
          researchers: ids.filter((id) => researched.has(id)).length,
        };
      })
      .sort((a, b) => (a.location === b.location ? b.visitors - a.visitors : b.visitors - a.visitors));
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3C Part 13 -- Geo x behaviour: top searches and top projects viewed
// per location (city-level, same reasoning as Part 12). Gated by a minimum
// sample size per location -- below it, the caller should show "Not enough
// data yet" rather than a thin, noisy top-N list.
// ─────────────────────────────────────────────────────────────────────────

const MIN_SESSIONS_FOR_GEO_BEHAVIOUR = 5;

export interface GeoBehaviourRow {
  location: string;
  sessions: number;
  topSearches: { query: string; count: number }[];
  topProjects: { projectId: string; count: number }[];
}

export async function getGeoBehaviourBreakdown(period: AnalyticsPeriod, topLocations = 5): Promise<GeoBehaviourRow[]> {
  return safeQuery("getGeoBehaviourBreakdown", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return [];

    const byCity = new Map<string, string[]>();
    for (const [sessionId, info] of sessionSource) {
      if (!info.city) continue;
      const list = byCity.get(info.city) ?? [];
      list.push(sessionId);
      byCity.set(info.city, list);
    }
    const eligibleCities = Array.from(byCity.entries())
      .filter(([, ids]) => ids.length >= MIN_SESSIONS_FOR_GEO_BEHAVIOUR)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, topLocations);
    if (eligibleCities.length === 0) return [];

    const allSessionIds = eligibleCities.flatMap(([, ids]) => ids);
    const [searches, views] = await Promise.all([
      prisma.researchEvent.findMany({
        where: { eventType: { in: SEARCH_EVENT_TYPES }, sessionId: { in: allSessionIds }, createdAt: { gte: period.since, lt: period.until } },
        select: { sessionId: true, metadata: true },
      }),
      prisma.researchEvent.findMany({
        where: { eventType: "PROJECT_VIEWED", sessionId: { in: allSessionIds }, entityId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
        select: { sessionId: true, entityId: true },
      }),
    ]);

    const sessionToCity = new Map<string, string>();
    for (const [city, ids] of eligibleCities) for (const id of ids) sessionToCity.set(id, city);

    const searchByCity = new Map<string, Map<string, number>>();
    for (const row of searches) {
      const city = row.sessionId ? sessionToCity.get(row.sessionId) : undefined;
      if (!city) continue;
      const q = (row.metadata as { query?: unknown } | null)?.query;
      if (typeof q !== "string" || !q.trim()) continue;
      const counts = searchByCity.get(city) ?? new Map<string, number>();
      const key = q.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      searchByCity.set(city, counts);
    }

    const viewByCity = new Map<string, Map<string, number>>();
    for (const row of views) {
      const city = row.sessionId ? sessionToCity.get(row.sessionId) : undefined;
      if (!city || !row.entityId) continue;
      const counts = viewByCity.get(city) ?? new Map<string, number>();
      counts.set(row.entityId, (counts.get(row.entityId) ?? 0) + 1);
      viewByCity.set(city, counts);
    }

    return eligibleCities.map(([city, ids]) => ({
      location: city,
      sessions: ids.length,
      topSearches: Array.from((searchByCity.get(city) ?? new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([query, count]) => ({ query, count })),
      topProjects: Array.from((viewByCity.get(city) ?? new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([projectId, count]) => ({ projectId, count })),
    }));
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Part 12 — Live activity breakdown, reusing PresenceHeartbeat (no new
// presence system). "Currently doing X" = that subject's most recent
// tracked action within the same 2-minute window presence.ts already
// treats as "active now" — an honest most-recent-signal read, not a
// guaranteed instantaneous one.
// ─────────────────────────────────────────────────────────────────────────

export type LiveActivity = "browsing" | "searching" | "viewing_project" | "viewing_transaction" | "viewing_brochure" | "researching";

export interface LiveActivityBreakdown {
  activeNow: number;
  byActivity: Record<LiveActivity, number>;
  lastUpdatedAt: string; // ISO timestamp this snapshot was computed
}

const SEARCHING_EVENTS: ResearchEventType[] = ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED", "FILTERS_USED", "TRANSACTION_FILTER_APPLIED"];
const PROJECT_EVENTS: ResearchEventType[] = ["PROJECT_VIEWED", "PROJECT_CARD_CLICKED"];
const TRANSACTION_EVENTS: ResearchEventType[] = ["TRANSACTION_VIEWED", "TRANSACTION_LIST_VIEWED"];
const RESEARCH_EVENTS: ResearchEventType[] = ["COMPARE_USED", "WISHLIST_ADDED", "MARKET_DATA_VIEWED", "INSIGHTS_VIEWED", "REPORT_VIEWED"];

export async function getLiveActivityBreakdown(): Promise<LiveActivityBreakdown> {
  return safeQuery(
    "getLiveActivityBreakdown",
    { activeNow: 0, byActivity: { browsing: 0, searching: 0, viewing_project: 0, viewing_transaction: 0, viewing_brochure: 0, researching: 0 }, lastUpdatedAt: new Date().toISOString() },
    async () => {
      const windowStart = new Date(Date.now() - 2 * 60_000); // matches presence.ts's ACTIVE_NOW_MINUTES
      const active = await prisma.presenceHeartbeat.findMany({
        where: { lastSeenAt: { gte: windowStart } },
        select: { subjectKey: true, publicUserId: true },
      });
      if (active.length === 0) {
        return { activeNow: 0, byActivity: { browsing: 0, searching: 0, viewing_project: 0, viewing_transaction: 0, viewing_brochure: 0, researching: 0 }, lastUpdatedAt: new Date().toISOString() };
      }

      const sessionIds = active.filter((a) => a.subjectKey.startsWith("anon:")).map((a) => a.subjectKey.slice("anon:".length));
      const userIds = active.filter((a) => a.publicUserId).map((a) => a.publicUserId as string);

      const [recentEvents, recentBrochureViews] = await Promise.all([
        prisma.researchEvent.findMany({
          where: {
            createdAt: { gte: windowStart },
            OR: [sessionIds.length ? { sessionId: { in: sessionIds } } : undefined, userIds.length ? { publicUserId: { in: userIds } } : undefined].filter(
              (c): c is NonNullable<typeof c> => c !== undefined
            ),
          },
          select: { sessionId: true, publicUserId: true, eventType: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.brochureDownloadEvent.findMany({
          where: {
            createdAt: { gte: windowStart },
            eventType: "VIEWED",
            OR: [sessionIds.length ? { sessionId: { in: sessionIds } } : undefined, userIds.length ? { publicUserId: { in: userIds } } : undefined].filter(
              (c): c is NonNullable<typeof c> => c !== undefined
            ),
          },
          select: { sessionId: true, publicUserId: true },
        }),
      ]);

      const brochureSubjects = new Set(recentBrochureViews.map((b) => b.publicUserId ?? (b.sessionId ? `anon:${b.sessionId}` : null)).filter(Boolean));
      const latestBySubject = new Map<string, ResearchEventType>();
      for (const e of recentEvents) {
        const key = e.publicUserId ?? (e.sessionId ? `anon:${e.sessionId}` : null);
        if (key && !latestBySubject.has(key)) latestBySubject.set(key, e.eventType); // first hit per subject is the latest, since ordered desc
      }

      const byActivity: Record<LiveActivity, number> = { browsing: 0, searching: 0, viewing_project: 0, viewing_transaction: 0, viewing_brochure: 0, researching: 0 };
      for (const subject of active) {
        const key = subject.publicUserId ?? subject.subjectKey;
        if (brochureSubjects.has(key)) {
          byActivity.viewing_brochure++;
          continue;
        }
        const eventType = latestBySubject.get(key);
        if (!eventType) byActivity.browsing++;
        else if (SEARCHING_EVENTS.includes(eventType)) byActivity.searching++;
        else if (PROJECT_EVENTS.includes(eventType)) byActivity.viewing_project++;
        else if (TRANSACTION_EVENTS.includes(eventType)) byActivity.viewing_transaction++;
        else if (RESEARCH_EVENTS.includes(eventType)) byActivity.researching++;
        else byActivity.browsing++;
      }

      return { activeNow: active.length, byActivity, lastUpdatedAt: new Date().toISOString() };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Part 13 — Founder insights: plain-language, generated ONLY from the real
// aggregates above (plus the existing getTrendingSearches, reused rather
// than duplicated). Every insight has a minimum-sample gate; if nothing
// clears it, the caller gets an empty list and should show "Not enough
// data yet." — never a generic or fabricated line.
// ─────────────────────────────────────────────────────────────────────────

const MIN_SESSIONS_FOR_CHANNEL_INSIGHT = 5;

export async function getFounderInsights(period: AnalyticsPeriod): Promise<string[]> {
  return safeQuery("getFounderInsights", [], async () => {
    const [channelQuality, deviceBreakdown, trending] = await Promise.all([
      getChannelQualityBreakdown(period),
      getDeviceBreakdown(period),
      getTrendingSearches(period, 3),
    ]);
    const insights: string[] = [];
    const SOURCE_LABEL: Partial<Record<VisitorSource, string>> = {
      google: "Google", instagram: "Instagram", linkedin: "LinkedIn", facebook: "Facebook", youtube: "YouTube",
      whatsapp: "WhatsApp", x_twitter: "X (Twitter)", reddit: "Reddit", email: "Email", direct: "Direct traffic",
    };

    const eligible = channelQuality.filter((c) => c.sessions >= MIN_SESSIONS_FOR_CHANNEL_INSIGHT);

    const byRegistered = eligible.filter((c) => c.registrationRate !== null).sort((a, b) => (b.registrationRate ?? 0) - (a.registrationRate ?? 0));
    if (byRegistered[0] && (byRegistered[0].registrationRate ?? 0) > 0) {
      const top = byRegistered[0];
      insights.push(`${SOURCE_LABEL[top.source] ?? top.source} has the highest registration rate this period (${top.registrationRate}% of ${top.sessions} visitors).`);
    }

    const byVolume = eligible.slice().sort((a, b) => b.sessions - a.sessions)[0];
    const byContact = eligible.filter((c) => c.contactRate !== null).sort((a, b) => (b.contactRate ?? 0) - (a.contactRate ?? 0))[0];
    if (byVolume && byContact && byVolume.source !== byContact.source && (byContact.contactRate ?? 0) > (byVolume.contactRate ?? 0)) {
      insights.push(
        `${SOURCE_LABEL[byVolume.source] ?? byVolume.source} brings the most visitors (${byVolume.sessions}), but ${SOURCE_LABEL[byContact.source] ?? byContact.source} visitors have a higher contact rate (${byContact.contactRate}% vs ${byVolume.contactRate ?? 0}%).`
      );
    }

    if (deviceBreakdown.coveredSessions >= MIN_SESSIONS_FOR_CHANNEL_INSIGHT) {
      const mobile = deviceBreakdown.byDevice.find((d) => d.label === "Mobile");
      if (mobile && mobile.percent >= 60) {
        insights.push(`${mobile.percent}% of tracked visitors this period are on mobile.`);
      }
    }

    const risingSearch = trending.find((t) => t.direction === "up" && t.percent !== null && t.percent >= 25 && t.count >= 3);
    if (risingSearch) {
      insights.push(`Searches for "${risingSearch.query}" are up ${risingSearch.percent}% vs the previous period.`);
    }

    // Phase 3C Part 14 -- geography insights, gated by the same minimum
    // sample size and never fabricated: only real counts from getGeoCityRows,
    // never an invented percentage or trend.
    const cityRows = await getGeoCityRows(period);
    const eligibleCities = cityRows.filter((c) => c.visitors >= MIN_SESSIONS_FOR_CHANNEL_INSIGHT);
    const totalGeoVisitors = cityRows.reduce((sum, c) => sum + c.visitors, 0);
    if (eligibleCities[0] && totalGeoVisitors > 0) {
      const top = eligibleCities[0];
      const share = Math.round((top.visitors / totalGeoVisitors) * 1000) / 10;
      if (share >= 30) insights.push(`${top.label} currently represents ${share}% of visitor traffic.`);
    }
    if (eligibleCities.length >= 2) {
      const [byVolumeCity, secondCity] = eligibleCities; // eligibleCities is already sorted by visitors desc (getGeoCityRows)
      const rateOf = (c: (typeof eligibleCities)[number]) => (c.visitors > 0 ? Math.round((c.registered / c.visitors) * 1000) / 10 : 0);
      const volumeRate = rateOf(byVolumeCity);
      const secondRate = rateOf(secondCity);
      if (secondRate > volumeRate) {
        insights.push(
          `${byVolumeCity.label} brings the most visitors (${byVolumeCity.visitors}), but registration rate is currently higher in ${secondCity.label} (${secondRate}% vs ${volumeRate}%).`
        );
      }
    }
    if (eligibleCities.length >= 2) {
      const topTwoCityNames = eligibleCities.slice(0, 2).map((c) => c.label);
      const viewCounts = await prisma.researchEvent.groupBy({
        by: ["sessionId"],
        _count: { _all: true },
        where: { eventType: "PROJECT_VIEWED", createdAt: { gte: period.since, lt: period.until } },
      });
      const sessionSource = await loadSessionSourceMap(period);
      const viewsByCity = new Map<string, { views: number; sessions: Set<string> }>();
      for (const v of viewCounts) {
        const sessionId = v.sessionId;
        if (!sessionId) continue;
        const city = sessionSource.get(sessionId)?.city;
        if (!city || !topTwoCityNames.includes(city)) continue;
        const entry = viewsByCity.get(city) ?? { views: 0, sessions: new Set<string>() };
        entry.views += v._count._all;
        entry.sessions.add(sessionId);
        viewsByCity.set(city, entry);
      }
      const depths = topTwoCityNames
        .map((city) => {
          const entry = viewsByCity.get(city);
          if (!entry || entry.sessions.size < MIN_SESSIONS_FOR_CHANNEL_INSIGHT) return null;
          return { city, depth: Math.round((entry.views / entry.sessions.size) * 10) / 10 };
        })
        .filter((d): d is { city: string; depth: number } => d !== null);
      if (depths.length === 2 && depths[0].depth !== depths[1].depth) {
        const [deeper, shallower] = depths[0].depth > depths[1].depth ? depths : [depths[1], depths[0]];
        insights.push(`Users from ${deeper.city} are researching more projects per session (${deeper.depth} avg) than users from ${shallower.city} (${shallower.depth} avg).`);
      }
    }

    return insights;
  });
}
