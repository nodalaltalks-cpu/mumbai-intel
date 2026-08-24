// No imports on purpose — shared by proxy.ts (Edge/Node middleware, same
// constraint as lib/referral-constants.ts) and lib/analytics/consent.ts (the
// server-only half of this feature).

export const CONSENT_COOKIE_NAME = "mi_cookie_consent";
export type ConsentValue = "granted" | "declined";
