import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Real-time active-user presence — one PresenceHeartbeat row per subject,
 * continuously upserted (find-then-update-or-create, the same pattern
 * RecentView/SavedProject already use, since the Neon HTTP adapter has no
 * native upsert()). Deliberately reuses this app's existing Postgres
 * database as the ephemeral store rather than adding Redis/KV — the
 * smallest safe solution given the current traffic scale (Part 3 of the
 * spec). If heartbeat write volume ever becomes the bottleneck itself,
 * PresenceHeartbeat is the one place that would move to a KV store —
 * every reader here goes through the functions below, not raw Prisma calls.
 */

const ACTIVE_NOW_MINUTES = 2;
const ACTIVE_5M_MINUTES = 5;
const ACTIVE_30M_MINUTES = 30;

export function anonymousSubjectKey(anonSessionId: string): string {
  return `anon:${anonSessionId}`;
}

export function registeredSubjectKey(publicUserId: string): string {
  return `user:${publicUserId}`;
}

/** Called by the heartbeat route on every beat — one row per subject, never one row per beat. */
export async function recordHeartbeat(params: { subjectKey: string; publicUserId: string | null; isAnonymous: boolean }): Promise<void> {
  const existing = await prisma.presenceHeartbeat.findUnique({ where: { subjectKey: params.subjectKey } });
  if (existing) {
    await prisma.presenceHeartbeat.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
    return;
  }
  await prisma.presenceHeartbeat.create({
    data: {
      subjectKey: params.subjectKey,
      publicUserId: params.publicUserId,
      isAnonymous: params.isAnonymous,
    },
  });
}

export interface ActiveUserCounts {
  activeNow: number;
  active5m: number;
  active30m: number;
  activeToday: number;
  anonymousActiveNow: number;
  registeredActiveNow: number;
}

/**
 * "Today" deliberately reuses the existing DAU logic (distinct
 * publicUserId/sessionId on ResearchEvent, already powering the founder
 * dashboard's DAU/WAU/MAU) rather than PresenceHeartbeat, which only ever
 * holds each subject's MOST RECENT beat — not a history of every subject
 * active earlier today whose heartbeat has since gone stale and been
 * overwritten or pruned.
 */
export async function getActiveUserCounts(todayActiveCount: number): Promise<ActiveUserCounts> {
  const now = Date.now();
  const since = (minutes: number) => new Date(now - minutes * 60_000);

  const [activeNow, active5m, active30m, anonymousActiveNow, registeredActiveNow] = await Promise.all([
    prisma.presenceHeartbeat.count({ where: { lastSeenAt: { gte: since(ACTIVE_NOW_MINUTES) } } }),
    prisma.presenceHeartbeat.count({ where: { lastSeenAt: { gte: since(ACTIVE_5M_MINUTES) } } }),
    prisma.presenceHeartbeat.count({ where: { lastSeenAt: { gte: since(ACTIVE_30M_MINUTES) } } }),
    prisma.presenceHeartbeat.count({ where: { lastSeenAt: { gte: since(ACTIVE_NOW_MINUTES) }, isAnonymous: true } }),
    prisma.presenceHeartbeat.count({ where: { lastSeenAt: { gte: since(ACTIVE_NOW_MINUTES) }, isAnonymous: false } }),
  ]);

  return { activeNow, active5m, active30m, activeToday: todayActiveCount, anonymousActiveNow, registeredActiveNow };
}

/**
 * "Today" (calendar day, UTC) distinct active subjects — registered
 * (distinct publicUserId) union anonymous (distinct sessionId), both from
 * ResearchEvent, the same table the founder dashboard's existing DAU
 * already reads (lib/admin-queries.ts getUserGrowthStats), just re-bucketed
 * to a calendar day instead of a rolling 24h window. A signed-in user who
 * also has anonymous-session events earlier the same day can be counted in
 * both groups — the same kind of approximation this app already accepts
 * elsewhere, not a precision this metric needs.
 */
export async function getTodayActiveCount(): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const [registeredGroups, anonymousGroups] = await Promise.all([
    prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: startOfDayUtc } } }),
    prisma.researchEvent.groupBy({ by: ["sessionId"], where: { publicUserId: null, sessionId: { not: null }, createdAt: { gte: startOfDayUtc } } }),
  ]);
  return registeredGroups.length + anonymousGroups.length;
}

/**
 * Prunes heartbeats stale well beyond any window this app reads (30m) —
 * keeps the table small (Part 3: "do not store a permanent row for every
 * heartbeat" extends to not keeping abandoned rows forever either). Called
 * from the platform-metrics cron, not on every heartbeat write.
 */
export async function pruneStaleHeartbeats(olderThanMinutes = 120): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const result = await prisma.presenceHeartbeat.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
  return result.count;
}
