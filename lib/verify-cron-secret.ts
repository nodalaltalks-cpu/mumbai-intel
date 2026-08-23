import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for the cron `Authorization: Bearer <CRON_SECRET>`
 * check shared by every /api/cron/* route — a naive `!==` string compare
 * leaks how many leading characters matched via response-time differences.
 * Real-world exploitability against CRON_SECRET is low (Vercel Cron is the
 * only realistic caller), but the fix is free, so there's no reason not to.
 */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}
