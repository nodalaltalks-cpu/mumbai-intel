import "server-only";

/**
 * In-memory fixed-window rate limiter. Deliberately dependency-free (no
 * Redis) — correct for this app's current single-instance deployment.
 * Scaling to multiple instances later means swapping the Map below for a
 * shared store (Redis/Upstash); every call site here is unaffected because
 * they only ever call `checkRateLimit`, never touch the store directly.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

// Prevents unbounded growth from abusive/scripted traffic hitting many distinct keys.
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}
