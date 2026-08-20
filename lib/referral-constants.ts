// No imports on purpose — this file is shared by proxy.ts (Edge/Node
// middleware, which must not pull in Prisma just to read a cookie name) and
// lib/referral.ts (the server-only DB-touching half of this feature).

/** First-touch attribution cookie, set by proxy.ts on any request to `/` carrying `?ref=`. 30-day window, matching typical marketing-attribution conventions; not overwritten once set (first touch wins). */
export const REFERRAL_COOKIE_NAME = "mi_ref_code";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
