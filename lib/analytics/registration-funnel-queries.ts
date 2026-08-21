import "server-only";
import { prisma } from "@/lib/prisma";
import type { PremiumFeature } from "@/lib/premium/types";
import type { TopViewedEntity } from "./research-queries";
import { buildBuckets, countByBucket, type AnalyticsPeriod } from "./period";

export interface ConversionSummary {
  guestSessions: number;
  previousGuestSessions: number;
  registeredUsers: number;
  newUsersInPeriod: number;
  previousNewUsersInPeriod: number;
  registrationRate: number | null;
  lockedClicks: number;
  googleSignupPercent: number | null;
  emailSignupPercent: number | null;
}

/** Guest visitors = distinct anon session ids with research activity but no signed-in user in the window — the same identity model as every other ResearchEvent query (getPublicSession()/anon cookie). */
async function countGuestSessions(since: Date, until: Date): Promise<number> {
  const rows = await prisma.researchEvent.findMany({
    where: { createdAt: { gte: since, lt: until }, publicUserId: null, sessionId: { not: null } },
    select: { sessionId: true },
  });
  return new Set(rows.map((r) => r.sessionId)).size;
}

/** registeredUsers stays an all-time cumulative total (the current user base size) -- newUsersInPeriod/guestSessions/lockedClicks/signup-method split are all scoped to the selected period, with a previous-period comparison for the two headline figures. */
export async function getConversionSummary(period: AnalyticsPeriod): Promise<ConversionSummary> {
  const [guestSessions, previousGuestSessions, registeredUsers, newUsersInPeriod, previousNewUsersInPeriod, lockedClicks, signupEvents] = await Promise.all([
    countGuestSessions(period.since, period.until),
    countGuestSessions(period.previousSince, period.previousUntil),
    prisma.publicUser.count(),
    prisma.publicUser.count({ where: { createdAt: { gte: period.since, lt: period.until } } }),
    prisma.publicUser.count({ where: { createdAt: { gte: period.previousSince, lt: period.previousUntil } } }),
    prisma.researchEvent.count({ where: { eventType: "LOCKED_FEATURE_CLICKED", createdAt: { gte: period.since, lt: period.until } } }),
    prisma.researchEvent.findMany({ where: { eventType: "SIGNUP_COMPLETED", createdAt: { gte: period.since, lt: period.until } }, select: { metadata: true } }),
  ]);

  let googleCount = 0;
  let emailCount = 0;
  for (const row of signupEvents) {
    const method = (row.metadata as { method?: string } | null)?.method;
    if (method === "google") googleCount += 1;
    else if (method === "credentials") emailCount += 1;
  }
  const totalMethodEvents = googleCount + emailCount;

  return {
    guestSessions,
    previousGuestSessions,
    registeredUsers,
    newUsersInPeriod,
    previousNewUsersInPeriod,
    registrationRate: guestSessions + newUsersInPeriod > 0 ? (newUsersInPeriod / (guestSessions + newUsersInPeriod)) * 100 : null,
    lockedClicks,
    googleSignupPercent: totalMethodEvents > 0 ? (googleCount / totalMethodEvents) * 100 : null,
    emailSignupPercent: totalMethodEvents > 0 ? (emailCount / totalMethodEvents) * 100 : null,
  };
}

export interface BucketPoint {
  label: string;
  count: number;
}

/** Signup trend bucketed at the period's granularity — matches lib/analytics/research-queries.ts's getEventTrend bucketing approach exactly. */
export async function getSignupTrend(period: AnalyticsPeriod): Promise<BucketPoint[]> {
  const rows = await prisma.publicUser.findMany({ where: { createdAt: { gte: period.since, lt: period.until } }, select: { createdAt: true } });
  return countByBucket(rows.map((r) => r.createdAt), buildBuckets(period));
}

export interface GuestVsLoggedInSplit {
  guestEvents: number;
  loggedInEvents: number;
}

/** Event-volume split by identity — publicUserId null means the event was recorded while browsing as a guest, same identity model as every other ResearchEvent query. */
export async function getGuestVsLoggedInSplit(period: AnalyticsPeriod): Promise<GuestVsLoggedInSplit> {
  const [guestEvents, loggedInEvents] = await Promise.all([
    prisma.researchEvent.count({ where: { createdAt: { gte: period.since, lt: period.until }, publicUserId: null } }),
    prisma.researchEvent.count({ where: { createdAt: { gte: period.since, lt: period.until }, publicUserId: { not: null } } }),
  ]);
  return { guestEvents, loggedInEvents };
}

/**
 * Projects a now-registered user viewed anonymously before they signed up —
 * the anon session cookie (mi_anon_id) is never rotated on login, so a
 * SIGNUP_COMPLETED row and the PROJECT_VIEWED rows that preceded it share
 * the same sessionId without any explicit backfill/link step. Scoped to
 * signups within the selected period. Grouped in JS (Neon HTTP adapter
 * groupBy avoidance), same pattern as getTopViewed in research-queries.ts.
 */
export async function getTopProjectsBeforeSignup(period: AnalyticsPeriod, limit = 10): Promise<TopViewedEntity[]> {
  const signups = await prisma.researchEvent.findMany({
    where: { eventType: "SIGNUP_COMPLETED", sessionId: { not: null }, createdAt: { gte: period.since, lt: period.until } },
    select: { sessionId: true, createdAt: true },
  });
  if (signups.length === 0) return [];

  const earliestSignupAt = new Map<string, Date>();
  for (const s of signups) {
    if (!s.sessionId) continue;
    const existing = earliestSignupAt.get(s.sessionId);
    if (!existing || s.createdAt < existing) earliestSignupAt.set(s.sessionId, s.createdAt);
  }

  const preSignupViews = await prisma.researchEvent.findMany({
    where: { eventType: "PROJECT_VIEWED", sessionId: { in: Array.from(earliestSignupAt.keys()) }, entityId: { not: null } },
    select: { sessionId: true, entityId: true, createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const v of preSignupViews) {
    if (!v.sessionId || !v.entityId) continue;
    const signupAt = earliestSignupAt.get(v.sessionId);
    if (!signupAt || v.createdAt >= signupAt) continue;
    counts.set(v.entityId, (counts.get(v.entityId) ?? 0) + 1);
  }

  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  if (topIds.length === 0) return [];

  const projects = await prisma.project.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } });
  const byId = new Map(projects.map((p) => [p.id, p]));
  return topIds
    .map((id) => ({ id, name: byId.get(id)?.name ?? "(deleted)", href: `/admin/projects/${id}/edit`, viewCount: counts.get(id) ?? 0 }))
    .filter((r) => byId.has(r.id));
}

export interface LockedFeatureClickCount {
  feature: PremiumFeature | "unknown";
  count: number;
}

/** Which locked surfaces actually drive sign-in prompts — top-of-funnel breakdown for LOCKED_FEATURE_CLICKED within the period, grouped in JS (Neon HTTP adapter has no groupBy on a JSON field). */
export async function getLockedFeatureClickCounts(period: AnalyticsPeriod): Promise<LockedFeatureClickCount[]> {
  const rows = await prisma.researchEvent.findMany({
    where: { eventType: "LOCKED_FEATURE_CLICKED", createdAt: { gte: period.since, lt: period.until } },
    select: { metadata: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const feature = (row.metadata as { feature?: string } | null)?.feature ?? "unknown";
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([feature, count]) => ({ feature: feature as PremiumFeature | "unknown", count }))
    .sort((a, b) => b.count - a.count);
}
