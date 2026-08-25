import "server-only";
import { prisma } from "@/lib/prisma";
import type { PlatformLoadState } from "@prisma/client";
import { readDbMetrics } from "./db-metrics";
import { getActiveUserCounts, getTodayActiveCount } from "./presence";
import { assessBottleneck } from "./snapshot";

/** Live composite for the Platform Health page — computed fresh on every load, not read from a stored snapshot (snapshots are for history/peaks only). */
export async function getLivePlatformStatus() {
  const [todayActiveCount, latestSnapshots] = await Promise.all([
    getTodayActiveCount(),
    prisma.platformMetricSnapshot.findMany({ orderBy: { capturedAt: "desc" }, take: 20, select: { dbAvgResponseMs: true } }),
  ]);
  const activeCounts = await getActiveUserCounts(todayActiveCount);
  const db = readDbMetrics();

  const historicalAvgs = latestSnapshots.map((s) => s.dbAvgResponseMs).filter((v): v is number => v !== null);
  const trailingAvgDbMs = historicalAvgs.length >= 5 ? historicalAvgs.reduce((sum, v) => sum + v, 0) / historicalAvgs.length : null;

  const assessment = assessBottleneck({
    dbAvgMs: db.avgMs,
    dbSampleCount: db.sampleCount,
    dbErrorCount: db.errorCount,
    dbTimeoutCount: db.timeoutCount,
    dbTotalCount: db.totalCount,
    trailingAvgDbMs,
  });

  return { activeCounts, db, assessment };
}

/**
 * Real, live-computed region check (Phase 3 audit's top finding) — compares
 * `VERCEL_REGION` (a Vercel system env var, only set when actually running
 * on Vercel) against the region embedded in DATABASE_URL's Neon hostname
 * (`...ap-southeast-1.aws.neon.tech`). Never hardcoded: if either value is
 * unavailable (e.g. local dev, or a differently-shaped connection string),
 * this honestly reports "unknown" rather than guessing.
 */
export interface RegionCheck {
  vercelRegion: string | null;
  neonRegion: string | null;
  mismatched: boolean | null;
}

export function checkRegionAlignment(): RegionCheck {
  const vercelRegion = process.env.VERCEL_REGION ?? null;
  const dbUrl = process.env.DATABASE_URL ?? "";
  const neonRegionMatch = dbUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech/);
  const neonRegion = neonRegionMatch ? neonRegionMatch[1] : null;

  if (!vercelRegion || !neonRegion) {
    return { vercelRegion, neonRegion, mismatched: null };
  }
  // Vercel region codes (e.g. "iad1") aren't the same naming scheme as AWS
  // regions (e.g. "ap-southeast-1") -- a real cross-check needs a small
  // lookup, not a string compare. Bounded to the regions Vercel actually
  // offers; an unmapped Vercel region reports "unknown" rather than a wrong answer.
  const VERCEL_TO_AWS_CONTINENT: Record<string, string> = {
    iad1: "us", cle1: "us", pdx1: "us", sfo1: "us",
    fra1: "eu", dub1: "eu", arn1: "eu", cdg1: "eu", lhr1: "eu",
    hnd1: "ap", icn1: "ap", sin1: "ap", syd1: "ap", bom1: "ap", kix1: "ap",
    gru1: "sa", cpt1: "af",
  };
  const vercelContinent = VERCEL_TO_AWS_CONTINENT[vercelRegion] ?? null;
  const neonContinent = neonRegion.split("-")[0]; // "ap-southeast-1" -> "ap"
  if (!vercelContinent) return { vercelRegion, neonRegion, mismatched: null };

  return { vercelRegion, neonRegion, mismatched: vercelContinent !== neonContinent };
}

export interface PlatformMetricHistoryPoint {
  capturedAt: Date;
  activeNow: number;
  activityEventCount: number;
  dbAvgResponseMs: number | null;
  dbP95ResponseMs: number | null;
  dbErrorCount: number;
  dbTimeoutCount: number;
  dbSampleCount: number;
  loadState: PlatformLoadState;
  primaryBottleneck: string | null;
}

/**
 * Defaults to 90 days, not 72 hours — the platform-metrics cron runs once a
 * day (Vercel Hobby plan's cron-frequency ceiling, see
 * app/api/cron/platform-metrics/route.ts), so a 72-hour window only ever
 * shows ~3 data points. 90 days of daily snapshots is what actually makes
 * Part H's "Today / 7 days / 30 days / 90 days" trend meaningful.
 */
export async function getPlatformMetricHistory(hoursBack = 24 * 90): Promise<PlatformMetricHistoryPoint[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  return prisma.platformMetricSnapshot.findMany({
    where: { capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: {
      capturedAt: true,
      activeNow: true,
      activityEventCount: true,
      dbAvgResponseMs: true,
      dbP95ResponseMs: true,
      dbErrorCount: true,
      dbTimeoutCount: true,
      dbSampleCount: true,
      loadState: true,
      primaryBottleneck: true,
    },
  });
}

export interface PeakRecord {
  activeNow: number;
  capturedAt: Date | null;
}

async function getPeakSince(since: Date | null): Promise<PeakRecord> {
  const top = await prisma.platformMetricSnapshot.findFirst({
    where: since ? { capturedAt: { gte: since } } : {},
    orderBy: { activeNow: "desc" },
    select: { activeNow: true, capturedAt: true },
  });
  return { activeNow: top?.activeNow ?? 0, capturedAt: top?.capturedAt ?? null };
}

export async function getPeakTraffic() {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [today, last7d, last30d, last90d] = await Promise.all([
    getPeakSince(startOfToday),
    getPeakSince(new Date(now - 7 * 24 * 60 * 60 * 1000)),
    getPeakSince(new Date(now - 30 * 24 * 60 * 60 * 1000)),
    getPeakSince(new Date(now - 90 * 24 * 60 * 60 * 1000)),
  ]);
  return { today, last7d, last30d, last90d };
}

export type Trend = "IMPROVING" | "STABLE" | "DEGRADING" | "UNKNOWN";

/** Part C — "Trend: Improving". Compares the average of the most recent 3 snapshots against the average of the 3 before that. Needs at least 4 snapshots to say anything at all. */
export function computeDbLatencyTrend(history: PlatformMetricHistoryPoint[]): Trend {
  const withLatency = history.filter((h) => h.dbAvgResponseMs !== null);
  if (withLatency.length < 4) return "UNKNOWN";
  const recent = withLatency.slice(-3);
  const prior = withLatency.slice(-6, -3);
  if (prior.length === 0) return "UNKNOWN";
  const recentAvg = recent.reduce((s, h) => s + (h.dbAvgResponseMs ?? 0), 0) / recent.length;
  const priorAvg = prior.reduce((s, h) => s + (h.dbAvgResponseMs ?? 0), 0) / prior.length;
  if (priorAvg === 0) return "UNKNOWN";
  const change = (recentAvg - priorAvg) / priorAvg;
  if (change <= -0.1) return "IMPROVING";
  if (change >= 0.1) return "DEGRADING";
  return "STABLE";
}

/**
 * Part 13 growth trend — "insufficient data" unless real snapshots exist
 * spanning close to the requested window (Part 13: "only calculate ... if
 * there is enough historical data").
 */
export async function getCapacityGrowthTrend() {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const earliestSnapshot = await prisma.platformMetricSnapshot.findFirst({ orderBy: { capturedAt: "asc" }, select: { capturedAt: true } });

  if (!earliestSnapshot || earliestSnapshot.capturedAt > thirtyDaysAgo) {
    return { sufficientData: false as const, coverageDays: earliestSnapshot ? Math.floor((now - earliestSnapshot.capturedAt.getTime()) / 86_400_000) : 0 };
  }

  const [peakThen, peakNow] = await Promise.all([
    prisma.platformMetricSnapshot.findFirst({
      where: { capturedAt: { gte: thirtyDaysAgo, lt: new Date(thirtyDaysAgo.getTime() + 24 * 60 * 60 * 1000) } },
      orderBy: { activeNow: "desc" },
      select: { activeNow: true },
    }),
    prisma.platformMetricSnapshot.findFirst({
      where: { capturedAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
      orderBy: { activeNow: "desc" },
      select: { activeNow: true },
    }),
  ]);

  const before = peakThen?.activeNow ?? 0;
  const today = peakNow?.activeNow ?? 0;
  const growthPercent = before > 0 ? Math.round(((today - before) / before) * 100) : null;

  return { sufficientData: true as const, peakThirtyDaysAgo: before, peakToday: today, growthPercent };
}
