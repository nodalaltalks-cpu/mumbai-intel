// No imports on purpose — shared by proxy.ts (Edge/Node middleware, same
// constraint as lib/referral-constants.ts) and any server-only caller.

export const VISITOR_SOURCE_COOKIE_NAME = "mi_source";
export const VISITOR_SOURCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days, matching the referral cookie's attribution window

export const VISITOR_SOURCES = [
  "google",
  "direct",
  "whatsapp",
  "instagram",
  "linkedin",
  "facebook",
  "youtube",
  "referral",
  "other_website",
  "unknown",
] as const;
export type VisitorSource = (typeof VISITOR_SOURCES)[number];

const PLATFORM_HOST_MATCHERS: [VisitorSource, string[]][] = [
  ["google", ["google."]],
  ["whatsapp", ["wa.me", "whatsapp."]],
  ["instagram", ["instagram."]],
  ["linkedin", ["linkedin."]],
  ["facebook", ["facebook.", "fb."]],
  ["youtube", ["youtube.", "youtu.be"]],
];

/** Matches a raw utm_source value (e.g. "whatsapp", "ig", "fb-ads") against the same platform buckets used for referrer-hostname matching. */
function classifyByUtmSource(utmSource: string): VisitorSource | null {
  const value = utmSource.toLowerCase();
  if (value.includes("google")) return "google";
  if (value.includes("whatsapp") || value === "wa") return "whatsapp";
  if (value.includes("instagram") || value === "ig") return "instagram";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("facebook") || value.includes("fb")) return "facebook";
  if (value.includes("youtube")) return "youtube";
  return null;
}

/**
 * Deterministic source classification (Section 30) from a referrer hostname
 * and an optional utm_source value — no guessing, no ML, every bucket
 * traceable to a real signal.
 *
 * utm_source is checked *before* falling back to "no referrer -> direct":
 * WhatsApp, Instagram, and most native-app in-app browsers strip the
 * `Referer` header entirely when opening a shared link, so a real WhatsApp
 * share overwhelmingly arrives with `referrerHost: null` -- if "direct" were
 * decided before consulting utm_source, the whatsapp/instagram buckets would
 * be unreachable for realistic traffic even though those are exactly the
 * sources the spec calls out (e.g. "WhatsApp visitors have highest profile
 * completion"). A link shared without any UTM tag still correctly falls
 * through to "direct" when there's also no referrer.
 */
export function classifyVisitorSource(referrerHost: string | null, utmSource: string | null): VisitorSource {
  if (utmSource) {
    const byUtm = classifyByUtmSource(utmSource);
    if (byUtm) return byUtm;
  }
  if (referrerHost) {
    const host = referrerHost.toLowerCase();
    for (const [source, needles] of PLATFORM_HOST_MATCHERS) {
      if (needles.some((needle) => host.includes(needle))) return source;
    }
    if (host.includes("nodalaltalks.com") || host.includes("localhost")) return "direct"; // internal navigation, not an external source
  }
  if (utmSource) return "referral";
  if (!referrerHost) return "direct";
  return "other_website";
}
