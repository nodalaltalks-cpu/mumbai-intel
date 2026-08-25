import "server-only";
import { prisma } from "@/lib/prisma";
import type { PlatformLoadState } from "@prisma/client";
import { readDbMetrics, resetDbMetrics } from "./db-metrics";
import { getActiveUserCounts, getTodayActiveCount, pruneStaleHeartbeats } from "./presence";

/**
 * Bottleneck/load-state classification (Parts 5-8 of the spec): NEVER a
 * fabricated "% of capacity" — no controlled load test has established a
 * real capacity baseline for this platform yet (see getCapacityAssessment
 * below), so this classifies load from RELATIVE degradation against this
 * platform's own recent measured history, plus a small number of absolute
 * thresholds that are defensible on their own terms (an error rate is bad
 * at 5% regardless of traffic volume — that's not a capacity claim).
 */

const ERROR_RATE_WATCH = 0.01; // 1%
const ERROR_RATE_WARNING = 0.05; // 5%
const ERROR_RATE_CRITICAL = 0.15; // 15%

/**
 * Connection timeouts (Phase 3, Part C) get their own, stricter absolute
 * thresholds rather than folding into the generic error-rate ratio above —
 * this is the exact failure mode Phase 2's load test observed at 50
 * concurrent requests (raw TCP connect timeouts to Neon), and it doesn't
 * behave like a normal query error: it's a sign of connection-pool/
 * concurrency exhaustion, worth flagging even at low absolute counts.
 */
const TIMEOUT_COUNT_WATCH = 1;
const TIMEOUT_COUNT_WARNING = 5;
const TIMEOUT_COUNT_CRITICAL = 20;

const LATENCY_DEGRADATION_WATCH = 1.4; // 40% above trailing baseline
const LATENCY_DEGRADATION_WARNING = 1.8; // 80% above trailing baseline
const LATENCY_DEGRADATION_CRITICAL = 2.5; // 150% above trailing baseline

const MIN_BASELINE_SNAPSHOTS = 5;

export interface BottleneckAssessment {
  loadState: PlatformLoadState;
  primaryBottleneck: string | null;
  bottleneckReason: string | null;
}

function classifyByRatio(ratio: number, watch: number, warning: number, critical: number): PlatformLoadState {
  if (ratio >= critical) return "CRITICAL";
  if (ratio >= warning) return "WARNING";
  if (ratio >= watch) return "WATCH";
  return "NORMAL";
}

const STATE_RANK: Record<PlatformLoadState, number> = { NORMAL: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 };

function classifyByCount(count: number, watch: number, warning: number, critical: number): PlatformLoadState {
  if (count >= critical) return "CRITICAL";
  if (count >= warning) return "WARNING";
  if (count >= watch) return "WATCH";
  return "NORMAL";
}

export function assessBottleneck(params: {
  dbAvgMs: number | null;
  dbSampleCount: number;
  dbErrorCount: number;
  dbTimeoutCount: number;
  dbTotalCount: number;
  trailingAvgDbMs: number | null;
}): BottleneckAssessment {
  const candidates: { state: PlatformLoadState; label: string; reason: string }[] = [];

  const errorRate = params.dbTotalCount > 0 ? params.dbErrorCount / params.dbTotalCount : 0;
  const errorState = classifyByRatio(errorRate, ERROR_RATE_WATCH, ERROR_RATE_WARNING, ERROR_RATE_CRITICAL);
  if (errorState !== "NORMAL") {
    candidates.push({
      state: errorState,
      label: "Error rate",
      reason: `Database query error rate is ${(errorRate * 100).toFixed(1)}% over the last ${params.dbTotalCount} queries observed by this instance.`,
    });
  }

  const timeoutState = classifyByCount(params.dbTimeoutCount, TIMEOUT_COUNT_WATCH, TIMEOUT_COUNT_WARNING, TIMEOUT_COUNT_CRITICAL);
  if (timeoutState !== "NORMAL") {
    candidates.push({
      state: timeoutState,
      label: "Database connection timeouts",
      reason: `${params.dbTimeoutCount} database connection timeout(s) observed — the same failure mode seen in the Phase 2 load test at high concurrency. Review connection/concurrency capacity before traffic increases further.`,
    });
  }

  if (params.dbAvgMs !== null && params.trailingAvgDbMs !== null && params.trailingAvgDbMs > 0) {
    const ratio = params.dbAvgMs / params.trailingAvgDbMs;
    const latencyState = classifyByRatio(ratio, LATENCY_DEGRADATION_WATCH, LATENCY_DEGRADATION_WARNING, LATENCY_DEGRADATION_CRITICAL);
    if (latencyState !== "NORMAL") {
      const pctAbove = Math.round((ratio - 1) * 100);
      candidates.push({
        state: latencyState,
        label: "Database response time",
        reason: `Database query latency is ${pctAbove}% above its trailing baseline (${params.dbAvgMs.toFixed(0)}ms vs ${params.trailingAvgDbMs.toFixed(0)}ms baseline).`,
      });
    }
  }

  if (candidates.length === 0) {
    return { loadState: "NORMAL", primaryBottleneck: null, bottleneckReason: null };
  }

  const worst = candidates.reduce((a, b) => (STATE_RANK[b.state] > STATE_RANK[a.state] ? b : a));
  return { loadState: worst.state, primaryBottleneck: worst.label, bottleneckReason: worst.reason };
}

/**
 * Called by the platform-metrics cron. Captures ONE real snapshot from
 * currently-known state: live active-user counts (PresenceHeartbeat),
 * DB latency/error samples collected in-process since the last capture
 * (lib/platform-metrics/db-metrics.ts), and a real activity-volume proxy
 * (ResearchEvent + PresenceHeartbeat writes since the last capture window).
 * Never invents a number for a metric this app cannot actually measure.
 */
export async function capturePlatformMetricSnapshot() {
  const [previousSnapshots, todayActiveCount] = await Promise.all([
    prisma.platformMetricSnapshot.findMany({ orderBy: { capturedAt: "desc" }, take: 20, select: { dbAvgResponseMs: true, capturedAt: true } }),
    getTodayActiveCount(),
  ]);

  const activeCounts = await getActiveUserCounts(todayActiveCount);
  const db = readDbMetrics();

  const windowStart = previousSnapshots[0]?.capturedAt ?? new Date(Date.now() - 60 * 60 * 1000);
  const activityEventCount = await prisma.researchEvent.count({ where: { createdAt: { gte: windowStart } } });

  const historicalAvgs = previousSnapshots.map((s) => s.dbAvgResponseMs).filter((v): v is number => v !== null);
  const trailingAvgDbMs =
    historicalAvgs.length >= MIN_BASELINE_SNAPSHOTS ? historicalAvgs.reduce((sum, v) => sum + v, 0) / historicalAvgs.length : null;

  const assessment = assessBottleneck({
    dbAvgMs: db.avgMs,
    dbSampleCount: db.sampleCount,
    dbErrorCount: db.errorCount,
    dbTimeoutCount: db.timeoutCount,
    dbTotalCount: db.totalCount,
    trailingAvgDbMs,
  });

  const snapshot = await prisma.platformMetricSnapshot.create({
    data: {
      activeNow: activeCounts.activeNow,
      active5m: activeCounts.active5m,
      active30m: activeCounts.active30m,
      activeToday: activeCounts.activeToday,
      anonymousActiveNow: activeCounts.anonymousActiveNow,
      registeredActiveNow: activeCounts.registeredActiveNow,
      dbSampleCount: db.sampleCount,
      dbAvgResponseMs: db.avgMs,
      dbP95ResponseMs: db.p95Ms,
      dbP99ResponseMs: db.p99Ms,
      dbErrorCount: db.errorCount,
      dbTimeoutCount: db.timeoutCount,
      activityEventCount,
      loadState: assessment.loadState,
      primaryBottleneck: assessment.primaryBottleneck,
      bottleneckReason: assessment.bottleneckReason,
    },
  });

  resetDbMetrics();
  const prunedCount = await pruneStaleHeartbeats();

  return { snapshot, prunedCount };
}
