/**
 * Phase 63 — a genuine production defect discovered by actually running the
 * pipeline at scale: neither the sitemap/robots fetch (robotsAndSitemap.ts)
 * nor the per-page fetch (discoverDeveloperProjects.ts) had any timeout. In
 * `runWithConcurrency`'s worker-pool, a worker only picks up its next item
 * after the current one settles — a single real-world page that never
 * responds (no error, just silence) permanently occupies that worker slot,
 * and since `Promise.all` waits for every worker's loop to exit, enough
 * stuck workers stall the ENTIRE batch indefinitely. Confirmed live: a
 * 3-developer pilot run never completed after 30+ minutes despite every
 * individual target site responding in under 2 seconds to a direct request.
 *
 * This wraps an existing `fetchImpl` call with a bounded timeout via
 * AbortController — the timeout becomes just another fetch rejection,
 * already handled by the existing per-item try/catch in runWithConcurrency
 * (Part P's failure isolation) and by fetchDeveloperUrlUniverse's own
 * never-throws design. No retry logic, no new crawler architecture — one
 * small, additive wrapper around the exact same fetch calls that already
 * existed.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`Timed out after ${timeoutMs}ms fetching ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
