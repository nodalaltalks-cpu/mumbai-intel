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
 *
 * State lives on `globalThis`, exactly like lib/prisma.ts's client
 * singleton — confirmed empirically in Phase 2 load testing that a plain
 * module-level array does NOT reliably survive across every route's
 * compiled module graph under Next.js/Turbopack (a page render and a Route
 * Handler can each get their own instance of an otherwise-identical
 * module), which silently zeroed every DB-latency reading. `globalThis` is
 * the one thing guaranteed process-wide regardless of bundler graph
 * splitting.
 */

const MAX_SAMPLES = 500;

interface DbMetricsState {
  durationsMs: number[];
  errorCount: number;
  /** Subset of errorCount — specifically raw TCP/TLS connect timeouts to Neon (UND_ERR_CONNECT_TIMEOUT), not a generic query failure. This is the exact symptom Phase 2's load test observed at 50 concurrent requests, so it's tracked separately rather than folded into a generic "errors" bucket. */
  timeoutCount: number;
  totalCount: number;
}

const globalForDbMetrics = globalThis as unknown as { __dbMetricsState: DbMetricsState | undefined };

function getState(): DbMetricsState {
  if (!globalForDbMetrics.__dbMetricsState) {
    globalForDbMetrics.__dbMetricsState = { durationsMs: [], errorCount: 0, timeoutCount: 0, totalCount: 0 };
  }
  return globalForDbMetrics.__dbMetricsState;
}

/**
 * Detects the specific connect-timeout shape confirmed by Phase 2's load
 * test (`Error [NeonDbError] ... sourceError: [TypeError: fetch failed] {
 * [cause]: Error [ConnectTimeoutError] { code: 'UND_ERR_CONNECT_TIMEOUT' } }`)
 * — undici's (Node's fetch implementation) connect-timeout error code,
 * walked through Prisma's/Neon's wrapping without depending on either
 * library's exact error class (duck-typed via `.code`/`.cause`, since
 * neither package exports these wrapper types for `instanceof` checks).
 */
function isConnectTimeoutError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") return true;
      current = (current as { cause?: unknown; sourceError?: unknown }).cause ?? (current as { sourceError?: unknown }).sourceError;
    } else {
      break;
    }
  }
  return false;
}

export function recordDbQuery(durationMs: number, ok: boolean, error?: unknown): void {
  const state = getState();
  state.totalCount += 1;
  if (!ok) {
    state.errorCount += 1;
    if (isConnectTimeoutError(error)) state.timeoutCount += 1;
    return;
  }
  state.durationsMs.push(durationMs);
  if (state.durationsMs.length > MAX_SAMPLES) state.durationsMs.shift();
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
  timeoutCount: number;
  totalCount: number;
}

/** Reads the current in-memory window WITHOUT resetting it — safe to call from a live page render. */
export function readDbMetrics(): DbMetricsSnapshot {
  const state = getState();
  const sampleCount = state.durationsMs.length;
  if (sampleCount === 0) {
    return { sampleCount: 0, avgMs: null, p95Ms: null, p99Ms: null, errorCount: state.errorCount, timeoutCount: state.timeoutCount, totalCount: state.totalCount };
  }
  const sorted = [...state.durationsMs].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    sampleCount,
    avgMs: Math.round(avg * 10) / 10,
    p95Ms: Math.round(percentile(sorted, 95) * 10) / 10,
    p99Ms: Math.round(percentile(sorted, 99) * 10) / 10,
    errorCount: state.errorCount,
    timeoutCount: state.timeoutCount,
    totalCount: state.totalCount,
  };
}

/** Called only by the platform-metrics cron after capturing a snapshot — resets the window so the next snapshot reflects only the traffic since this one. */
export function resetDbMetrics(): void {
  const state = getState();
  state.durationsMs.length = 0;
  state.errorCount = 0;
  state.timeoutCount = 0;
  state.totalCount = 0;
}
