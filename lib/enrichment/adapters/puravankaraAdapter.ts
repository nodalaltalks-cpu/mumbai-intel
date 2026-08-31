import { CONSTRUCTION_BADGE_LABEL, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Verified live during Phase 42 against puravankara.com's real markup for
 * the purva-estrella project page. A FIFTH distinct page shape now proven:
 * a Next.js frontend backed by a Strapi CMS, the SAME `{ data: { id,
 * attributes: {...} } }` envelope Gurukrupa Realcon's site uses (Phase 40) --
 * but a completely different field taxonomy (`projectTitle`/`Price`/
 * `Apartments`/`Address`/`ProjectHighlights`/`Amenities`/`project_statuses`
 * here, vs `projectTitle`/`status`/`location`/`rerasec`/`advantageItems`
 * there) -- confirming this is a genuinely different CMS content model, not
 * a copy-pasted shape. No Organization JSON-LD exists on this project page
 * (it lives on puravankara.com's own homepage, a different page) -- same
 * "one fetch per project page" discipline as every other adapter here, so
 * developerGroup is deliberately left MISSING rather than fetched as a
 * side effect.
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

/** Returns the real embedded Strapi project object (`props.pageProps.singleproject[0].attributes`), or null if the page's markup shape ever changes -- never throws. */
function extractProjectAttributes(html: string): Record<string, unknown> | null {
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { props?: { pageProps?: { singleproject?: unknown } } };
    const list = parsed?.props?.pageProps?.singleproject;
    const first = Array.isArray(list) ? list[0] : (list as { "0"?: unknown } | undefined)?.["0"];
    const attrs = (first as { attributes?: unknown } | undefined)?.attributes;
    return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function plainTextFromHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = decodeHtmlEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return text || null;
}

/** This page's rich-text bullet lists are one `<p>` per bullet (`<p>- A Gated Community</p>`), each prefixed with a literal "- " and a stray U+2060 WORD JOINER character -- split BEFORE tag-stripping (not after, which would merge every bullet into one run-on sentence), then clean each bullet individually. */
function extractParagraphBullets(html: string): string[] {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  return paragraphs
    .map((p) => plainTextFromHtml(p) ?? "")
    .map((p) => p.replace(/^-\s*⁠?\s*/, "").trim())
    .filter((p) => p.length > 0);
}

function resolveUrl(raw: string, origin: string): string {
  return raw.startsWith("http") ? raw : `${origin}${raw}`;
}

/** Strapi single-media field shape: `{ data: { attributes: { url } } }`. */
function mediaUrl(mediaField: unknown, origin: string): string | null {
  const data = (mediaField as { data?: unknown } | undefined)?.data as { attributes?: Record<string, unknown> } | null | undefined;
  const raw = data?.attributes?.url;
  return typeof raw === "string" ? resolveUrl(raw, origin) : null;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Parses `"3.52 Cr+"` into rupees, matching the registry's own formatPaise() display convention. Deliberately returns ONLY a minimum -- this page never states a maximum, so priceMax stays MISSING rather than invented. */
function parseStartingPriceDisplay(text: string): string | null {
  const cr = text.match(/([\d.]+)\s*Cr/i);
  if (!cr) return null;
  const rupees = Math.round(parseFloat(cr[1]) * 1e7);
  return `₹${(rupees / 1e7).toFixed(2)} Cr`;
}

/**
 * Reverses this codebase's own `CONSTRUCTION_BADGE_LABEL` map, but ONLY
 * where exactly one `ProjectStatus` produces that label -- same discipline
 * kalpataruAdapter.ts already established. This page's own status field
 * reads "Newly Launched" -- a real-estate-industry phrasing variant of this
 * codebase's "New Launch" (CONSTRUCTION_BADGE_LABEL.PRE_LAUNCH), not a
 * literal string match, so kept at Medium confidence rather than High.
 */
function unambiguousStatusFromBadgeLabel(label: string): ProjectStatus | null {
  const normalized = label.trim().toLowerCase().replace(/^newly\s+launched$/, "new launch");
  const matches = (Object.keys(CONSTRUCTION_BADGE_LABEL) as ProjectStatus[]).filter(
    (status) => CONSTRUCTION_BADGE_LABEL[status].toLowerCase() === normalized
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Puravankara project page (Phase 42 -- fifth developer, first one whose
 * candidate came straight out of Phase 41's bulk discovery run). Every path
 * here was confirmed against the actual live markup for purva-estrella:
 * `<title>`/meta description, and a Strapi-backed `__NEXT_DATA__` payload
 * exposing `projectTitle`, `Price`, `Address`, `About` (rich-text overview),
 * `ProjectHighlights` (a discrete `item` array plus prose bullets),
 * `Amenities` (27 named entries), `project_statuses`, and `Banner` (single-
 * media desktop banner).
 *
 * Real, deliberate non-extractions (this page's own genuine gaps, not
 * parsing failures):
 *  - No RERA number is published anywhere on this page (confirmed by
 *    scanning the raw HTML for "rera" -- the only hit is generic marketing
 *    copy, "RERA-compliant projects", not an actual registration number) --
 *    reraNumber/reraStatus correctly report MISSING.
 *  - `About.Brochure.data` and `floorPlanPdf.data` are both `null` -- no
 *    brochure has been uploaded yet.
 *  - `Gallery` is `null` and `constructionupdates.video` is an empty array --
 *    no photo gallery or video exists on this page.
 *  - `Location`/`locationAdvantage` are `null`/`[]` -- no coordinates or
 *    Google Maps link exists on this page.
 *  - `Faqs` is `null` on this specific project record.
 */
export function extractPurvaEstrellaFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const origin = "https://www.puravankara.com";

  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: title, confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: description, confidence: "High" };

  const attrs = extractProjectAttributes(html);
  if (!attrs) return facts;

  const nameFact = fact(attrs.projectTitle, "High", { note: "Embedded page data (__NEXT_DATA__), singleproject[0].attributes.projectTitle." });
  if (nameFact) facts.name = nameFact;

  // Confirmed via this page's own title/meta description text, both of which
  // explicitly describe the project as "Apartments" -- not inferred beyond
  // what the page itself states.
  if (/apartments/i.test(title ?? "") || /apartments/i.test(description ?? "")) {
    facts.category = { value: "Residential", confidence: "High", note: "Page's own title/meta description both describe this project as apartments." };
  }

  try {
    const statusEntries = ((attrs.project_statuses as { data?: unknown } | undefined)?.data ?? []) as Record<string, unknown>[];
    const rawStatus = (statusEntries[0]?.attributes as Record<string, unknown> | undefined)?.projectStatus;
    if (typeof rawStatus === "string" && rawStatus.trim()) {
      const mapped = unambiguousStatusFromBadgeLabel(rawStatus);
      if (mapped) {
        facts.status = {
          value: STATUS_LABEL[mapped],
          confidence: "Medium",
          note: `Page's own status label ("${rawStatus}") -- a phrasing variant of this codebase's CONSTRUCTION_BADGE_LABEL.${mapped} ("${CONSTRUCTION_BADGE_LABEL[mapped]}"), not a literal match, so kept at Medium confidence.`,
        };
      }
    }
  } catch {
    /* ignore */
  }

  const addressFact = fact(attrs.Address, "High", { note: "Page's own labeled Address field." });
  if (addressFact) {
    facts.locality = addressFact;
    facts.microMarket = { ...addressFact, note: "Same labeled Address field, offered here as the street-level micro-market descriptor." };
  }

  try {
    if (typeof attrs.Price === "string") {
      const priceDisplay = parseStartingPriceDisplay(attrs.Price);
      if (priceDisplay) {
        facts.priceMin = {
          value: priceDisplay,
          confidence: "High",
          note: `Page's own labeled Price field ("${attrs.Price}") -- a "starting from" figure, used only as a minimum. No maximum is ever stated on this page, so priceMax correctly reports MISSING.`,
        };
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const about = attrs.About as Record<string, unknown> | undefined;
    const aboutText = plainTextFromHtml(about?.Description);
    if (aboutText) {
      facts.tagline = {
        value: aboutText,
        confidence: "Medium",
        ambiguous: true,
        note: 'Marketing prose from the page\'s own "About" rich-text block -- needs editorial shortening/approval, not a verbatim fact.',
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const highlights = attrs.ProjectHighlights as Record<string, unknown> | undefined;
    const items = Array.isArray(highlights?.item) ? (highlights!.item as Record<string, unknown>[]) : [];
    const towersItem = items.find((i) => typeof i.text === "string" && i.text.trim().toLowerCase() === "towers");
    if (towersItem && typeof towersItem.Title === "string" && /^\d+$/.test(towersItem.Title.trim())) {
      facts.totalTowers = { value: towersItem.Title.trim(), confidence: "High", note: "Page's own structured ProjectHighlights.item array (Towers entry)." };
    }

    const rawDescription = highlights?.Description;
    const bullets = typeof rawDescription === "string" ? extractParagraphBullets(rawDescription) : [];
    // The first paragraph is an intro sentence, not a bullet (no leading "- ") --
    // real bullets are every paragraph after it.
    const introText = bullets[0];
    const bulletItems = bullets.slice(1);
    if (bulletItems.length) {
      facts.highlights = {
        value: `${bulletItems.length} listed`,
        confidence: "Medium",
        ambiguous: true,
        note: `Page's own "Project Highlights" section${introText ? ` ("${introText}")` : ""}: ${bulletItems.join(", ")}.`,
        items: bulletItems,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const amenitiesSection = attrs.Amenities as Record<string, unknown> | undefined;
    const list = ((amenitiesSection?.amenities as { data?: unknown } | undefined)?.data ?? []) as Record<string, unknown>[];
    const names = list.map((a) => (a.attributes as Record<string, unknown> | undefined)?.Title).filter((n): n is string => typeof n === "string" && n.length > 0);
    if (names.length) {
      facts.amenities = {
        value: `${names.length} selected`,
        confidence: "High",
        note: `Named list from the page's own structured Amenities section: ${names.join(", ")}.`,
        items: names,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const banners = Array.isArray(attrs.Banner) ? (attrs.Banner as Record<string, unknown>[]) : [];
    const coverFact = fact(mediaUrl(banners[0]?.Desktopbanner, origin), "High", { note: "Page's own desktop banner image." });
    if (coverFact) facts.coverImage = coverFact;
  } catch {
    /* ignore */
  }

  // Deliberately NOT populated -- confirmed genuinely absent from this page
  // during Phase 42's inspection (no field/section exists for them, not a
  // parsing failure): developerGroup (lives on puravankara.com's homepage,
  // not this project page), builder, priceMax, reraNumber, reraStatus,
  // reraCertificateUrl, googleMapsUrl, latitude, longitude, possessionMonth,
  // possessionYear, launchDate, actualPossession, constructionPercent,
  // landAreaAcres, totalUnits, paymentPlanType, paymentPlanDescription,
  // specifications, faqs, videoUrl, tour360Url, brochure, documents, images,
  // ogImageUrl.

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Puravankara (Phase 42 -- fifth
 * developer, first one selected directly from Phase 41's bulk discovery
 * batch). Same contract as every other adapter here: a genuine `fetch()`,
 * no fixture data, throws on fetch failure so the caller can distinguish
 * "source unavailable" from "found nothing."
 */
export const puravankaraAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Puravankara page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractPurvaEstrellaFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Puravankara (Phase 42). */
export const PURVA_ESTRELLA_PROJECT_URL = "https://www.puravankara.com/residential/mumbai/purva-estrella";
