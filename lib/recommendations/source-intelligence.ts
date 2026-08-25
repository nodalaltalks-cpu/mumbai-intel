import "server-only";
import { prisma } from "@/lib/prisma";
import type { AnalyticsPeriod } from "@/lib/analytics/period";
import { loadSessionSourceMap } from "@/lib/analytics/visitor-intelligence";
import { VISITOR_SOURCES, type VisitorSource } from "@/lib/analytics/visitor-source-constants";

/**
 * Phase 3B Part 14/16 — "which acquisition channel produces users who
 * actually benefit from the recommendation engine." Reuses the existing
 * RECOMMENDATION_IMPRESSION/RECOMMENDATION_CLICKED ResearchEvent rows
 * (lib/recommendations/impressions.ts) and the same VISITOR_SOURCE_IDENTIFIED
 * session→source map lib/analytics/visitor-intelligence.ts already builds
 * for Visitor Intelligence — no new events, no new tables. A separate file
 * (not added to founder-intelligence.ts) so the existing, tested
 * recommendation-intelligence queries stay untouched.
 *
 * Coverage: only impressions/clicks whose session (or, for a signed-in user,
 * the session they originally signed up through) has a known acquisition
 * source. A user who accepted cookies before this event existed, or who
 * signed in on a device/browser with no session history at all, won't be
 * attributable to a source here — same disclosed limitation as the rest of
 * Visitor Intelligence, not silently glossed over.
 */

async function safeQuery<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[recommendation-source-intelligence] ${label} failed:`, error);
    return fallback;
  }
}

export interface RecommendationBySourceRow {
  source: VisitorSource;
  users: number;
  impressions: number;
  ctrPercent: number | null;
  saveRatePercent: number | null;
  compareRatePercent: number | null;
  contactRatePercent: number | null;
}

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // same convention as founder-intelligence.ts / ml/dataset.ts

export async function getRecommendationPerformanceBySource(period: AnalyticsPeriod): Promise<RecommendationBySourceRow[]> {
  return safeQuery("getRecommendationPerformanceBySource", [], async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return [];

    // Bridge: a session with a known source that later signed up -- lets a
    // registered user's later, sessionId-less-in-practice events (publicUserId
    // set but the anon cookie may have rotated) still resolve back to their
    // original acquisition source, the same anon-to-registered bridge
    // visitor-queries.ts already relies on for its own registered-count.
    const signupBridge = await prisma.researchEvent.findMany({
      where: { eventType: "SIGNUP_COMPLETED", sessionId: { in: Array.from(sessionSource.keys()) } },
      select: { sessionId: true, publicUserId: true },
    });
    const userSource = new Map<string, VisitorSource>();
    for (const row of signupBridge) {
      if (row.sessionId && row.publicUserId) {
        const source = sessionSource.get(row.sessionId)?.source;
        if (source) userSource.set(row.publicUserId, source);
      }
    }

    function resolveSource(sessionId: string | null, publicUserId: string | null): VisitorSource | null {
      if (sessionId) {
        const s = sessionSource.get(sessionId)?.source;
        if (s) return s;
      }
      if (publicUserId) {
        const s = userSource.get(publicUserId);
        if (s) return s;
      }
      return null;
    }

    const impressions = await prisma.researchEvent.findMany({
      where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: period.since, lte: period.until } },
      select: { sessionId: true, publicUserId: true, createdAt: true },
    });
    if (impressions.length === 0) return [];

    const attributionEnd = new Date(period.until.getTime() + ATTRIBUTION_WINDOW_MS);
    const [clicks, saves, compares, contacts] = await Promise.all([
      prisma.researchEvent.findMany({ where: { eventType: "RECOMMENDATION_CLICKED", createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, publicUserId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "WISHLIST_ADDED", createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, publicUserId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "COMPARE_USED", createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, publicUserId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "CONTACT_ENQUIRY_SUBMITTED", createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, publicUserId: true } }),
    ]);

    const bySource = new Map<VisitorSource, { users: Set<string>; impressions: number; clicked: Set<string>; saved: Set<string>; compared: Set<string>; contacted: Set<string> }>();
    const subjectOf = (sessionId: string | null, publicUserId: string | null) => publicUserId ?? sessionId ?? "";

    for (const imp of impressions) {
      const source = resolveSource(imp.sessionId, imp.publicUserId);
      if (!source) continue;
      const subject = subjectOf(imp.sessionId, imp.publicUserId);
      if (!subject) continue;
      const row = bySource.get(source) ?? { users: new Set(), impressions: 0, clicked: new Set(), saved: new Set(), compared: new Set(), contacted: new Set() };
      row.users.add(subject);
      row.impressions += 1;
      bySource.set(source, row);
    }
    if (bySource.size === 0) return [];

    function markIfKnownSubject(rows: { sessionId: string | null; publicUserId: string | null }[], pick: (row: ReturnType<typeof bySource.get> extends infer T ? NonNullable<T> : never) => Set<string>) {
      for (const r of rows) {
        const source = resolveSource(r.sessionId, r.publicUserId);
        if (!source) continue;
        const row = bySource.get(source);
        if (!row) continue;
        const subject = subjectOf(r.sessionId, r.publicUserId);
        if (row.users.has(subject)) pick(row).add(subject);
      }
    }
    markIfKnownSubject(clicks, (row) => row.clicked);
    markIfKnownSubject(saves, (row) => row.saved);
    markIfKnownSubject(compares, (row) => row.compared);
    markIfKnownSubject(contacts, (row) => row.contacted);

    const rate = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);
    return VISITOR_SOURCES.map((source) => {
      const row = bySource.get(source);
      if (!row || row.users.size === 0) return null;
      const totalUsers = row.users.size;
      return {
        source,
        users: totalUsers,
        impressions: row.impressions,
        ctrPercent: rate(row.clicked.size, totalUsers),
        saveRatePercent: rate(row.saved.size, totalUsers),
        compareRatePercent: rate(row.compared.size, totalUsers),
        contactRatePercent: rate(row.contacted.size, totalUsers),
      };
    })
      .filter((row): row is RecommendationBySourceRow => row !== null)
      .sort((a, b) => b.impressions - a.impressions);
  });
}

/**
 * Part 15 — one real, complete example trail (source → search → recommended
 * → clicked → viewed → saved/compared → contacted), if one genuinely exists
 * in the period. Never a fabricated narrative: returns null when no session
 * actually completed the full chain, and the UI must show "No complete
 * example in this period" rather than inventing one.
 */
export interface RecommendationJourneyExample {
  source: VisitorSource;
  searchQuery: string | null;
  projectName: string;
  reasons: string[];
  contacted: boolean;
  compared: boolean;
  saved: boolean;
}

export async function getRecommendationJourneyExample(period: AnalyticsPeriod): Promise<RecommendationJourneyExample | null> {
  return safeQuery("getRecommendationJourneyExample", null, async () => {
    const sessionSource = await loadSessionSourceMap(period);
    if (sessionSource.size === 0) return null;

    const attributionEnd = new Date(period.until.getTime() + ATTRIBUTION_WINDOW_MS);
    const impressions = await prisma.researchEvent.findMany({
      where: { eventType: "RECOMMENDATION_IMPRESSION", sessionId: { in: Array.from(sessionSource.keys()) }, createdAt: { gte: period.since, lte: period.until }, entityId: { not: null } },
      select: { sessionId: true, entityId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (impressions.length === 0) return null;

    const sessionIds = [...new Set(impressions.map((i) => i.sessionId as string))];
    const [clicks, saves, compares, contacts, searches] = await Promise.all([
      prisma.researchEvent.findMany({ where: { eventType: "RECOMMENDATION_CLICKED", sessionId: { in: sessionIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, entityId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "WISHLIST_ADDED", sessionId: { in: sessionIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true, entityId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "COMPARE_USED", sessionId: { in: sessionIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: "CONTACT_ENQUIRY_SUBMITTED", sessionId: { in: sessionIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { sessionId: true } }),
      prisma.researchEvent.findMany({ where: { eventType: { in: ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED"] }, sessionId: { in: sessionIds }, createdAt: { lte: period.until } }, select: { sessionId: true, metadata: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    ]);

    const clickedKey = new Set(clicks.map((c) => `${c.sessionId}:${c.entityId}`));
    const savedKey = new Set(saves.map((s) => `${s.sessionId}:${s.entityId}`));
    const comparedSessions = new Set(compares.map((c) => c.sessionId));
    const contactedSessions = new Set(contacts.map((c) => c.sessionId));
    const lastSearchBySession = new Map<string, string>();
    for (const s of searches) {
      if (s.sessionId && !lastSearchBySession.has(s.sessionId)) {
        const q = (s.metadata as { query?: unknown } | null)?.query;
        if (typeof q === "string" && q.trim()) lastSearchBySession.set(s.sessionId, q.trim());
      }
    }

    // Prefer the richest real trail available: contacted > compared > saved > clicked.
    const candidates = impressions
      .filter((imp) => imp.sessionId && clickedKey.has(`${imp.sessionId}:${imp.entityId}`))
      .map((imp) => ({
        imp,
        contacted: contactedSessions.has(imp.sessionId),
        compared: comparedSessions.has(imp.sessionId),
        saved: savedKey.has(`${imp.sessionId}:${imp.entityId}`),
      }))
      .sort((a, b) => Number(b.contacted) - Number(a.contacted) || Number(b.compared) - Number(a.compared) || Number(b.saved) - Number(a.saved));

    const best = candidates[0];
    if (!best || !best.imp.sessionId || !best.imp.entityId) return null;

    const source = sessionSource.get(best.imp.sessionId)?.source;
    if (!source) return null;

    const project = await prisma.project.findUnique({ where: { id: best.imp.entityId }, select: { name: true } });
    if (!project) return null;

    const meta = best.imp.metadata as { reasons?: string[] } | null;
    return {
      source,
      searchQuery: lastSearchBySession.get(best.imp.sessionId) ?? null,
      projectName: project.name,
      reasons: meta?.reasons ?? [],
      contacted: best.contacted,
      compared: best.compared,
      saved: best.saved,
    };
  });
}
