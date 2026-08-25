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
    dbTotalCount: db.totalCount,
    trailingAvgDbMs,
  });

  return { activeCounts, db, assessment };
}

export interface PlatformMetricHistoryPoint {
  capturedAt: Date;
  activeNow: number;
  activityEventCount: number;
  dbAvgResponseMs: number | null;
  dbP95ResponseMs: number | null;
  dbErrorCount: number;
  dbSampleCount: number;
  loadState: PlatformLoadState;
  primaryBottleneck: string | null;
}

export async function getPlatformMetricHistory(hoursBack = 72): Promise<PlatformMetricHistoryPoint[]> {
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
