// No imports on purpose — shared by proxy.ts (Edge/Node middleware, same
// constraint as lib/referral-constants.ts) and any server-only caller.

export const VISITOR_SOURCE_COOKIE_NAME = "mi_source";
export const VISITOR_SOURCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days, matching the referral cookie's attribution window

export const VISITOR_SOURCES = [
  "google",
  "google_discover",
  "direct",
  "whatsapp",
  "instagram",
  "linkedin",
  "facebook",
  "youtube",
  "x_twitter",
  "reddit",
  "email",
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
  ["x_twitter", ["twitter.", "x.com", "t.co"]],
  ["reddit", ["reddit.", "redd.it"]],
];

/**
 * Matches a raw utm_source value (e.g. "whatsapp", "ig", "fb-ads") against the
 * same platform buckets used for referrer-hostname matching, plus two
 * buckets that have NO reliable referrer signal at all and are only ever
 * reachable via an explicit UTM tag:
 *
 * - "google_discover": Discover (and most other feed/app surfaces) strips
 *   the referrer entirely, identical to a bare direct visit -- there is no
 *   real signal here unless the founder tags a Discover-targeted link with
 *   utm_source=google_discover themselves. Never inferred automatically.
 * - "email": a campaign email click carries no browser-referrer either (mail
 *   clients don't set Referer) -- only reachable via utm_medium=email or an
 *   explicit utm_source=email/newsletter tag on the link.
 */
function classifyByUtmSource(utmSource: string, utmMedium: string | null): VisitorSource | null {
  const value = utmSource.toLowerCase();
  const medium = utmMedium?.toLowerCase() ?? null;
  if (value.includes("google_discover") || value.includes("discover")) return "google_discover";
  if (medium === "email" || value.includes("email") || value.includes("newsletter")) return "email";
  if (value.includes("google")) return "google";
  if (value.includes("whatsapp") || value === "wa") return "whatsapp";
  if (value.includes("instagram") || value === "ig") return "instagram";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("facebook") || value.includes("fb")) return "facebook";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("twitter") || value === "x") return "x_twitter";
  if (value.includes("reddit")) return "reddit";
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
/**
 * Higher-level grouping over the same VISITOR_SOURCES buckets (visitor
 * analytics Section 3) — e.g. Instagram/LinkedIn/Facebook/YouTube/X/Reddit
 * all roll up to SOCIAL. EMAIL is its own group (reachable only via an
 * explicit UTM tag, never guessed) now that a real capture path exists for
 * it; google_discover rolls into organic_search since it IS Google traffic,
 * just a different surface.
 */
export const CHANNEL_GROUPS = ["organic_search", "social", "direct", "whatsapp", "email", "referral", "other"] as const;
export type ChannelGroup = (typeof CHANNEL_GROUPS)[number];

export const VISITOR_SOURCE_CHANNEL_GROUP: Record<VisitorSource, ChannelGroup> = {
  google: "organic_search",
  google_discover: "organic_search",
  instagram: "social",
  linkedin: "social",
  facebook: "social",
  youtube: "social",
  x_twitter: "social",
  reddit: "social",
  whatsapp: "whatsapp",
  email: "email",
  direct: "direct",
  referral: "referral",
  other_website: "referral",
  unknown: "other",
};

export function classifyVisitorSource(referrerHost: string | null, utmSource: string | null, utmMedium: string | null = null): VisitorSource {
  if (utmSource) {
    const byUtm = classifyByUtmSource(utmSource, utmMedium);
    if (byUtm) return byUtm;
  }
  if (utmMedium?.toLowerCase() === "email") return "email"; // utm_medium=email with no utm_source still unambiguously identifies the channel
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
