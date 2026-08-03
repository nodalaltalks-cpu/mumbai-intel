import "server-only";
import { prisma } from "@/lib/prisma";
import type { PremiumFeature } from "@/lib/premium/types";

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
