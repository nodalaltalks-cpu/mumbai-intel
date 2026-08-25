import "server-only";

/**
 * Real, in-process Prisma query-duration/error sampling — no new
 * infrastructure, no APM vendor. Populated by the `$extends` query
 * instrumentation wired onto the shared client in lib/prisma.ts.
 *
 * Deliberately per-instance, in-memory, and bounded (a ring buffer, not an
 * unbounded array) — the same tradeoff lib/rate-limit.ts already makes and
 * documents for this app's current single/few-instance Vercel deployment.
 * On a serverless platform with many concurrent instances, this samples
 * "whatever traffic this instance happened to see since its last cold
 * start" — real numbers, not a global fleet-wide measurement. That gap is
 * disclosed on the Platform Health page itself, not hidden.
 */

const MAX_SAMPLES = 500;
const durationsMs: number[] = [];
let errorCount = 0;
let totalCount = 0;

export function recordDbQuery(durationMs: number, ok: boolean): void {
  totalCount += 1;
  if (!ok) {
    errorCount += 1;
    return;
  }
  durationsMs.push(durationMs);
  if (durationsMs.length > MAX_SAMPLES) durationsMs.shift();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface DbMetricsSnapshot {
  sampleCount: number;
  avgMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  errorCount: number;
  totalCount: number;
}

/** Reads the current in-memory window WITHOUT resetting it — safe to call from a live page render. */
export function readDbMetrics(): DbMetricsSnapshot {
  const sampleCount = durationsMs.length;
  if (sampleCount === 0) {
    return { sampleCount: 0, avgMs: null, p95Ms: null, p99Ms: null, errorCount, totalCount };
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    sampleCount,
    avgMs: Math.round(avg * 10) / 10,
    p95Ms: Math.round(percentile(sorted, 95) * 10) / 10,
    p99Ms: Math.round(percentile(sorted, 99) * 10) / 10,
    errorCount,
    totalCount,
  };
}

/** Called only by the platform-metrics cron after capturing a snapshot — resets the window so the next snapshot reflects only the traffic since this one. */
export function resetDbMetrics(): void {
  durationsMs.length = 0;
  errorCount = 0;
  totalCount = 0;
}
