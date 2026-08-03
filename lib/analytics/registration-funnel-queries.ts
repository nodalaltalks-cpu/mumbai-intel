import "server-only";
import { prisma } from "@/lib/prisma";
import type { PremiumFeature } from "@/lib/premium/types";
import type { TopViewedEntity } from "./research-queries";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export interface ConversionSummary {
  guestSessions30d: number;
  registeredUsers: number;
  registrationRate: number | null;
  lockedClicks30d: number;
  signupsToday: number;
  signupsThisWeek: number;
  googleSignupPercent: number | null;
  emailSignupPercent: number | null;
}

/** Guest visitors = distinct anon session ids with research activity but no signed-in user in the window — the same identity model as every other ResearchEvent query (getPublicSession()/anon cookie). */
async function countGuestSessions(since: Date): Promise<number> {
  const rows = await prisma.researchEvent.findMany({
    where: { createdAt: { gte: since }, publicUserId: null, sessionId: { not: null } },
    select: { sessionId: true },
  });
  return new Set(rows.map((r) => r.sessionId)).size;
}

export async function getConversionSummary(): Promise<ConversionSummary> {
  const now = new Date();
  const since30d = daysAgo(30);

  const [guestSessions30d, registeredUsers, lockedClicks30d, signupsToday, signupsThisWeek, signupEvents] = await Promise.all([
    countGuestSessions(since30d),
    prisma.publicUser.count(),
    prisma.researchEvent.count({ where: { eventType: "LOCKED_FEATURE_CLICKED", createdAt: { gte: since30d } } }),
    prisma.publicUser.count({ where: { createdAt: { gte: startOfDay(now) } } }),
    prisma.publicUser.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.researchEvent.findMany({ where: { eventType: "SIGNUP_COMPLETED" }, select: { metadata: true } }),
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
    guestSessions30d,
    registeredUsers,
    registrationRate: guestSessions30d + registeredUsers > 0 ? (registeredUsers / (guestSessions30d + registeredUsers)) * 100 : null,
    lockedClicks30d,
    signupsToday,
    signupsThisWeek,
    googleSignupPercent: totalMethodEvents > 0 ? (googleCount / totalMethodEvents) * 100 : null,
    emailSignupPercent: totalMethodEvents > 0 ? (emailCount / totalMethodEvents) * 100 : null,
  };
}

export interface DailySignupPoint {
  date: string;
  count: number;
}

/** Daily PublicUser signups — matches lib/analytics/research-queries.ts's getEventTrend bucketing shape exactly. */
export async function getSignupTrend(days = 30): Promise<DailySignupPoint[]> {
  const since = daysAgo(days - 1);
  const rows = await prisma.publicUser.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export interface GuestVsLoggedInSplit {
  guestEvents: number;
  loggedInEvents: number;
}

/** Event-volume split by identity — publicUserId null means the event was recorded while browsing as a guest, same identity model as every other ResearchEvent query. */
export async function getGuestVsLoggedInSplit(days = 30): Promise<GuestVsLoggedInSplit> {
  const since = daysAgo(days - 1);
  const [guestEvents, loggedInEvents] = await Promise.all([
    prisma.researchEvent.count({ where: { createdAt: { gte: since }, publicUserId: null } }),
    prisma.researchEvent.count({ where: { createdAt: { gte: since }, publicUserId: { not: null } } }),
  ]);
  return { guestEvents, loggedInEvents };
}

/**
 * Projects a now-registered user viewed anonymously before they signed up —
 * the anon session cookie (mi_anon_id) is never rotated on login, so a
 * SIGNUP_COMPLETED row and the PROJECT_VIEWED rows that preceded it share
 * the same sessionId without any explicit backfill/link step. Grouped in
 * JS (Neon HTTP adapter groupBy avoidance), same pattern as getTopViewed
 * in research-queries.ts.
 */
export async function getTopProjectsBeforeSignup(limit = 10): Promise<TopViewedEntity[]> {
  const signups = await prisma.researchEvent.findMany({
    where: { eventType: "SIGNUP_COMPLETED", sessionId: { not: null } },
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

/** Which locked surfaces actually drive sign-in prompts — top-of-funnel breakdown for LOCKED_FEATURE_CLICKED, grouped in JS (Neon HTTP adapter has no groupBy on a JSON field). */
export async function getLockedFeatureClickCounts(): Promise<LockedFeatureClickCount[]> {
  const rows = await prisma.researchEvent.findMany({ where: { eventType: "LOCKED_FEATURE_CLICKED" }, select: { metadata: true } });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const feature = (row.metadata as { feature?: string } | null)?.feature ?? "unknown";
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([feature, count]) => ({ feature: feature as PremiumFeature | "unknown", count }))
    .sort((a, b) => b.count - a.count);
}
