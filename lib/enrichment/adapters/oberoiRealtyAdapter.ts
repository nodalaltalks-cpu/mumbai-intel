import { CONSTRUCTION_BADGE_LABEL, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 47 against oberoirealty.com's real markup for
 * two Andheri West project pages (Oberoi Sky Heights, Oberoi Springs). A
 * SEVENTH distinct page shape now proven: a plain server-rendered Drupal
 * site (no Next.js/Strapi JSON payload the way Puravankara/Gurukrupa use --
 * confirmed by scanning both pages for `__NEXT_DATA__`/`application/ld+json`
 * project data; only generic Organization/WebSite JSON-LD exists, with zero
 * project-specific fields in it). Every fact here is extracted from the
 * page's own plain HTML text, the same discipline lodhaAdapter.ts already
 * established for its non-JSON CMS.
 *
 * Domain confirmed via: a real sitemap (Screaming-Frog-generated,
 * oberoirealty.com/sitemap.xml) listing genuine residential project pages
 * (including both pages used here), a matching Organization JSON-LD (name
 * "Oberoi Realty", cross-linked to the real facebook/instagram/youtube/
 * linkedin profiles), and a clean robots.txt (only /search, /comment/reply,
 * /node/add disallowed -- no block on /residential/*).
 */
const H1_PATTERN = /<h1[^>]*>([^<]+)<\/h1>/i;
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];
// Every project page uses this exact `<p>Label</p>...<h4>Value</h4>` pair
// inside a `cnt_text` block for its key facts row (Location/Configuration/
// Project Status) -- confirmed identical across both real pages, just with
// a different subset of labels present on each.
const CNT_TEXT_PAIR_PATTERN = /<div class="cnt_text">\s*<p>([^<]+)<\/p>\s*<h4>([^<]+)<\/h4>/gi;
const RERA_PATTERN = /registration number:?\s*(P\d[\dA-Z]{5,})/i;
const AMENITY_PATTERN = /<p class="amenities_p">([^<]+)<\/p>/gi;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Every `<p>Label</p><h4>Value</h4>` pair on the page, keyed by the label text exactly as shown (e.g. "Location", "Configuration", "Project Status") -- which labels exist varies per project, never assumed fixed. */
function extractCntTextPairs(html: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const match of html.matchAll(CNT_TEXT_PAIR_PATTERN)) {
    const label = decodeHtmlEntities(match[1].trim());
    const value = decodeHtmlEntities(match[2].trim());
    if (label && value) pairs[label] = value;
  }
  return pairs;
}

/**
 * Maps this page's own "Project Status" text onto this codebase's
 * CONSTRUCTION_BADGE_LABEL vocabulary, same discipline as
 * puravankaraAdapter.ts's unambiguousStatusFromBadgeLabel -- only a known,
 * justified phrasing variant is mapped ("Completed" -> DELIVERED's "Ready to
 * Move"), never a guess. Kept at Medium confidence, matching that precedent.
 */
function statusFromProjectStatusLabel(label: string): ProjectStatus | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "completed") return "DELIVERED";
  const matches = (Object.keys(CONSTRUCTION_BADGE_LABEL) as ProjectStatus[]).filter(
    (status) => CONSTRUCTION_BADGE_LABEL[status].toLowerCase() === normalized
  );
  return matches.length === 1 ? matches[0] : null;
}

export function extractOberoiRealtyFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};

  const h1Match = html.match(H1_PATTERN);
  const nameFact = fact(h1Match ? decodeHtmlEntities(h1Match[1].trim()) : undefined, "High", { note: "Page's own <h1> project name." });
  if (nameFact) facts.name = nameFact;

  const titleMatch = html.match(TITLE_PATTERN);
  if (titleMatch) facts.metaTitle = { value: decodeHtmlEntities(titleMatch[1].trim()), confidence: "High" };

  for (const pattern of META_DESCRIPTION_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      facts.metaDescription = { value: decodeHtmlEntities(m[1].trim()), confidence: "High" };
      break;
    }
  }

  const pairs = extractCntTextPairs(html);

  const localityFact = fact(pairs["Location"], "High", { note: "Page's own labeled Location field." });
  if (localityFact) facts.locality = localityFact;

  if (pairs["Configuration"]) {
    facts.highlights = {
      value: `Configuration: ${pairs["Configuration"]}`,
      confidence: "Medium",
      note: `Page's own labeled Configuration field: "${pairs["Configuration"]}".`,
    };
    if (/bhk|apartment|duplex|penthouse/i.test(pairs["Configuration"])) {
      facts.category = { value: "Residential", confidence: "High", note: "Page's own Configuration field describes residential unit types." };
    }
  }

  if (pairs["Project Status"]) {
    const mapped = statusFromProjectStatusLabel(pairs["Project Status"]);
    if (mapped) {
      facts.status = {
        value: STATUS_LABEL[mapped],
        confidence: "Medium",
        note: `Page's own "Project Status" label ("${pairs["Project Status"]}") mapped to this codebase's ${mapped}.`,
      };
    }
  }

  const reraMatch = html.match(RERA_PATTERN);
  if (reraMatch) {
    facts.reraNumber = { value: reraMatch[1].trim(), confidence: "High", note: "Page's own MahaRERA registration-number disclosure text." };
  }

  const amenityNames = [...html.matchAll(AMENITY_PATTERN)].map((m) => decodeHtmlEntities(m[1].trim())).filter(Boolean);
  if (amenityNames.length) {
    facts.amenities = {
      value: `${amenityNames.length} selected`,
      confidence: "High",
      note: `Named list from the page's own amenities section: ${amenityNames.join(", ")}.`,
      items: amenityNames,
    };
  }

  // Deliberately NOT populated -- confirmed genuinely absent from both real
  // pages inspected during Phase 47 (no field/section exists, not a parsing
  // failure): developerGroup (lives on the homepage, not the project page),
  // builder, priceMin/priceMax, possessionMonth/possessionYear (this
  // developer does not publish pricing or possession dates publicly),
  // reraStatus, reraCertificateUrl, googleMapsUrl, latitude/longitude,
  // launchDate, actualPossession, constructionPercent, landAreaAcres,
  // totalUnits, totalTowers, paymentPlanType/Description, specifications,
  // faqs, videoUrl, tour360Url, brochure, documents, images, ogImageUrl.

  return facts;
}

/** Real, live OfficialSourceAdapter for Oberoi Realty (Phase 47). Same contract as every other adapter here: a genuine fetch(), no fixture data, throws on fetch failure. */
export const oberoiRealtyAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Oberoi Realty page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractOberoiRealtyFacts(html);
  },
};

/** The two curated project pages this MVP knows how to enrich for Oberoi Realty (Phase 47), both hand-verified as real Andheri West residential projects on the developer's own sitemap. */
export const OBEROI_SKY_HEIGHTS_PROJECT_URL = "https://www.oberoirealty.com/residential/oberoi-sky-heights-andheri-west";
export const OBEROI_SPRINGS_PROJECT_URL = "https://www.oberoirealty.com/residential/oberoi-springs-andheri-west";
