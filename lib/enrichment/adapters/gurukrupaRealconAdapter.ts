import { STATUS_LABEL } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Verified live during Phase 40 against gurukruparealcon.com's real markup
 * for the gurukrupa-ekam project page. A FOURTH distinct page shape: a
 * Next.js frontend (like Godrej) backed by a Strapi CMS (the classic
 * `{ data: { id, attributes: {...} } }` envelope, with media fields shaped
 * `{ data: { attributes: { url, formats: {...} } } }`) -- materially
 * different from Godrej's own Next.js CMS shape, Adani's Sitecore JSS, and
 * Kalpataru's plain server-rendered HTML with no embedded JSON at all. The
 * page's own JSON-LD is a single BreadcrumbList (no Organization/Product
 * block) -- developer identity instead comes from the curated domain
 * registry (this developer's Organization JSON-LD lives on the SITE'S
 * homepage, not this project page; fetching a second page just for that one
 * fact would break the "one fetch per project page" contract every other
 * adapter here follows, so it is deliberately left MISSING rather than
 * fetched as a side effect).
 */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];
const NEXT_DATA_PATTERN = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractTitle(html: string): string | null {
  const match = html.match(TITLE_PATTERN);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractMetaDescription(html: string): string | null {
  for (const pattern of META_DESCRIPTION_PATTERNS) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

/** Returns the real embedded Strapi project object (`props.pageProps.projectDetail.attributes`), or null if the page's markup shape ever changes -- never throws. */
function extractProjectAttributes(html: string): Record<string, unknown> | null {
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { props?: { pageProps?: { projectDetail?: { attributes?: unknown } } } };
    const attrs = parsed?.props?.pageProps?.projectDetail?.attributes;
    return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Strapi's rich-text overview fields are raw, HTML-entity-encoded HTML strings (`<p>...&amp;...</p>`) -- flattened to plain text, tags/comments stripped, entities decoded. */
function plainTextFromHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = decodeHtmlEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return text || null;
}

function resolveUrl(raw: string, origin: string): string {
  return raw.startsWith("http") ? raw : `${origin}${raw}`;
}

/** Strapi single-media field shape: `{ data: { attributes: { url } } }` (a banner image, a brochure, etc). `url` is already the original full-size upload. Relative `/uploads/...` paths are resolved against the site's own origin. */
function mediaUrl(mediaField: unknown, origin: string): string | null {
  const data = (mediaField as { data?: unknown } | undefined)?.data as { attributes?: Record<string, unknown> } | null | undefined;
  const raw = data?.attributes?.url;
  return typeof raw === "string" ? resolveUrl(raw, origin) : null;
}

/** Strapi multi-media field shape: `{ data: [{ attributes: { url } }, ...] }` (a gallery tab's photo set). */
function mediaUrlList(mediaField: unknown, origin: string): string[] {
  const data = (mediaField as { data?: unknown } | undefined)?.data;
  const entries = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return entries
    .map((entry) => (entry.attributes as Record<string, unknown> | undefined)?.url)
    .filter((u): u is string => typeof u === "string")
    .map((u) => resolveUrl(u, origin));
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Parses `"Maha RERA No. : PM1180002501525"` into the bare registration number. */
function parseReraNumber(title: unknown): string | null {
  if (typeof title !== "string") return null;
  const match = title.match(/([A-Z]{1,3}\d{6,})/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Gurukrupa Realcon project page (Phase 40 -- fourth developer, first one
 * discovered via Phase 39's area-discovery pipeline rather than picked by
 * hand up front). Every path here was confirmed against the actual live
 * markup for gurukrupa-ekam: `<title>`/meta description, a single
 * BreadcrumbList JSON-LD, and a Strapi-backed `__NEXT_DATA__` payload
 * exposing `projectTitle`, `status`, `location`, `overview`, `rerasec`,
 * `locationAdvantage` (with an embedded Google Maps URL), `advantageItems`
 * (a connectivity/location-advantage list), and `projectGallery` (named
 * interior photos).
 *
 * Real, deliberate non-extractions (this page's own genuine gaps, not
 * parsing failures):
 *  - No price is published anywhere on this page (confirmed by scanning the
 *    raw HTML for currency/₹/Cr/Lakh text -- none found) -- priceMin
 *    correctly reports MISSING, matching the Adani Linkbay precedent rather
 *    than inferring anything from a third-party listing.
 *  - `amenities` is a real key in the CMS schema but is `null` on this
 *    specific project record -- a genuine CMS-population gap (the prose in
 *    `overview.description` even mentions "70+ curated lifestyle amenities"),
 *    left MISSING rather than parsed out of marketing prose.
 *  - `overview.brochure.data` is `null` -- no brochure has been uploaded yet.
 *  - `constructionupdate` is `null` -- no construction-progress content
 *    exists on this page, so constructionPercent/actualPossession are
 *    MISSING, not inferred from the "ongoing" status label.
 *  - `projectGallery.videotabcontent` is an empty array -- no video exists.
 */
export function extractGurukrupaEkamFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const origin = "https://gurukruparealcon.com";

  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: title, confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: description, confidence: "High" };

  const attrs = extractProjectAttributes(html);
  if (!attrs) return facts; // Regex-based facts above still stand even if the embedded data block is gone.

  const nameFact = fact(attrs.projectTitle, "High", { note: "Embedded page data (__NEXT_DATA__), projectDetail.attributes.projectTitle." });
  if (nameFact) facts.name = nameFact;

  if (typeof attrs.projectType === "string" && attrs.projectType.trim().toLowerCase() === "residential") {
    facts.category = { value: "Residential", confidence: "High", note: "Page's own projectType field." };
  }

  try {
    // The developer's own site organizes projects into three real categories
    // (ongoing/upcoming/completed -- visible in gurukrupagroup.com's sibling
    // sitemap taxonomy, Phase 38) that map cleanly onto this registry's
    // status vocabulary; "ongoing" is standard real-estate-industry language
    // for "under construction", not a guess specific to this one project.
    if (typeof attrs.status === "string" && attrs.status.trim().toLowerCase() === "ongoing") {
      facts.status = {
        value: STATUS_LABEL.UNDER_CONSTRUCTION,
        confidence: "Medium",
        note: 'Page\'s own status field value "ongoing", mapped via the developer\'s own site-wide ongoing/upcoming/completed project taxonomy -- a real-estate-industry convention, not a literal string match, so kept at Medium confidence for human confirmation.',
      };
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof attrs.location === "string" && attrs.location.trim()) {
      const loc = attrs.location.trim();
      facts.locality = {
        value: loc,
        confidence: "Medium",
        ambiguous: true,
        note: `Page's own location field reads plainly "${loc}" -- it does not itself specify West/East/etc., so this needs human confirmation against the correct administrative locality rather than being assumed.`,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const overview = attrs.overview as Record<string, unknown> | undefined;
    const overviewText = plainTextFromHtml(overview?.description);
    if (overviewText) {
      facts.tagline = {
        value: overviewText,
        confidence: "Medium",
        ambiguous: true,
        note: 'Marketing prose from the page\'s own "overview" rich-text block -- needs editorial shortening/approval, not a verbatim fact.',
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const banner = attrs.banner as Record<string, unknown> | undefined;
    const coverFact = fact(mediaUrl(banner?.desktopBanner, origin), "High", { note: "Page's own desktop banner image." });
    if (coverFact) facts.coverImage = coverFact;
  } catch {
    /* ignore */
  }

  try {
    const rerasec = attrs.rerasec as Record<string, unknown> | undefined;
    const reraNumber = parseReraNumber(rerasec?.title);
    if (reraNumber) {
      facts.reraNumber = { value: reraNumber, confidence: "High", note: 'Page\'s own RERA section title ("Maha RERA No. : ...").' };
    }
  } catch {
    /* ignore */
  }

  try {
    const locationAdvantage = attrs.locationAdvantage as Record<string, unknown> | undefined;
    if (typeof locationAdvantage?.map === "string") {
      // Phase 43: confirmed against the real gurukrupa-maurya page -- that
      // project's own CMS `map` field has a real data-entry mistake, the
      // whole <iframe ...> embed tag's attributes pasted in after the URL
      // (`...!5m2!1sen!2sin" width="600" height="450" ...`), not just Ekam's
      // clean bare-URL convention. Truncating at the first literal `"`
      // recovers the real URL on every project without needing per-project
      // special-casing.
      const rawMapValue = locationAdvantage.map as string;
      const cleanMapUrl = rawMapValue.split('"')[0].trim();
      facts.googleMapsUrl = { value: cleanMapUrl, confidence: "High" };
    }
  } catch {
    /* ignore */
  }

  try {
    const advantageGroups = Array.isArray(attrs.advantageItems) ? (attrs.advantageItems as Record<string, unknown>[]) : [];
    const lines: string[] = [];
    for (const group of advantageGroups) {
      const items = Array.isArray(group.advantages) ? (group.advantages as Record<string, unknown>[]) : [];
      for (const item of items) {
        if (typeof item.name === "string" && item.name.trim()) {
          lines.push(typeof item.distance === "string" && item.distance.trim() ? `${item.name.trim()} (${item.distance.trim()})` : item.name.trim());
        }
      }
    }
    if (lines.length) {
      facts.highlights = {
        value: `${lines.length} listed`,
        confidence: "Medium",
        ambiguous: true,
        note: `Page's own "location advantage" / connectivity list: ${lines.join(", ")}. Real content, but it's a connectivity list, not general project highlights -- needs curation.`,
        items: lines,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const gallery = attrs.projectGallery as Record<string, unknown> | undefined;
    const tabs = Array.isArray(gallery?.galleryTab) ? (gallery!.galleryTab as Record<string, unknown>[]) : [];
    const urls = tabs.flatMap((t) => mediaUrlList(t.images, origin));
    if (urls.length) {
      facts.images = {
        value: `${urls.length} image(s)`,
        confidence: "High",
        note: `Named gallery photos: ${tabs.map((t) => t.title).filter(Boolean).join(", ")}.`,
        items: urls,
      };
    }
  } catch {
    /* ignore */
  }

  // Deliberately NOT populated -- confirmed genuinely absent from this page
  // during Phase 40's inspection (no field/section exists for them, not a
  // parsing failure): developerGroup (lives on the site's homepage, not this
  // project page -- see file doc comment), builder, address, priceMin,
  // possessionMonth, possessionYear, launchDate, actualPossession,
  // constructionPercent, landAreaAcres, totalUnits, totalTowers,
  // paymentPlanType, paymentPlanDescription, amenities, specifications, faqs,
  // videoUrl, tour360Url, brochure, documents, reraCertificateUrl, ogImageUrl,
  // microMarket (same single "location" string used for locality; no
  // separate street-level descriptor exists).

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Gurukrupa Realcon (Phase 40 -- fourth
 * developer, discovered rather than hand-picked). Same contract as every
 * other adapter here: a genuine `fetch()`, no fixture data, throws on fetch
 * failure so the caller can distinguish "source unavailable" from "found
 * nothing."
 */
export const gurukrupaRealconAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Gurukrupa Realcon page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractGurukrupaEkamFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Gurukrupa Realcon (Phase 40). */
export const GURUKRUPA_EKAM_PROJECT_URL = "https://gurukruparealcon.com/projects/gurukrupa-ekam";
