import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time `Authorization: Bearer <APIFY_WEBHOOK_SECRET>` check for the
 * Apify ingestion webhook (app/api/ingest/apify) — same reasoning and same
 * pattern as lib/verify-cron-secret.ts's CRON_SECRET check, kept as a
 * separate file (not a shared/generalized helper) so this webhook's own
 * secret is configured and rotated independently of the cron secret, and so
 * neither route's auth is affected by changes made for the other.
 */
export function verifyApifyWebhookSecret(request: Request): boolean {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}
