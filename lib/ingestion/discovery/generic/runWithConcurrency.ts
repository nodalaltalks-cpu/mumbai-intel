/**
 * Phase 55 Part L/P — a tiny, reused bounded-concurrency runner. Same
 * worker-pool shape already used ad hoc in earlier phases' one-off enrichment
 * scripts, pulled out here as a real, tested, importable utility since this
 * phase needs it at TWO levels (developer-level concurrency 2, and a second,
 * smaller cap for page fetches within one developer).
 *
 * Failure isolation (Part P): one item's rejection is caught and reported
 * per-item, never thrown out of the pool — one bad page/developer can never
 * abort the rest of the batch.
 */
export interface ConcurrencyResult<R> {
  index: number;
  result: R | null;
  error: string | null;
}

export async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<ConcurrencyResult<R>[]> {
  const results: ConcurrencyResult<R>[] = new Array(items.length);
  let cursor = 0;
  const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { index: i, result: await fn(items[i], i), error: null };
      } catch (e) {
        results[i] = { index: i, result: null, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
