import { STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 49 against rustomjee.com's real markup for two
 * projects with genuinely different content completeness (Ocean Vista,
 * Versova -- rich; Elements, Juhu -- thin, sold-out). A TENTH distinct page
 * shape now proven: a Next.js site that injects its `@graph` JSON-LD via a
 * client-side `<Script>` component rather than a literal
 * `<script type="application/ld+json">` tag -- the schema JSON is embedded
 * as an ESCAPED STRING inside `self.__next_s.push([0,{"type":"application/
 * ld+json", ..., "children":"{\"@graph\":[...]}"}])`. Confirmed by actually
 * inspecting the raw HTML: no literal `<script type="application/ld+json">`
 * block exists anywhere on either page, but the string is present, double-
 * JSON-encoded (the outer JS string, then the inner JSON document).
 *
 * NOT every Rustomjee project page carries this blob -- Ocean Vista (rich)
 * has it; Elements Juhu (thin/sold-out) does not. This adapter therefore
 * has TWO layers, never assuming the richer one is always present:
 *  1. Primary: parse the `@graph` blob when present (name, address.
 *     addressLocality, description, image, amenityFeature array,
 *     additionalProperty array for MahaRERA/Configuration/Property Status).
 *  2. Fallback (always attempted, works on every page regardless of #1):
 *     <title>, meta description, and a raw-HTML RERA regex.
 *
 * Domain confirmed via: a clean robots.txt (only /wp-admin/ disallowed,
 * Sitemap directive present), a real sitemap-index.xml -> sitemap-projects.xml
 * listing 146 real URLs (57 top-level residential projects after excluding
 * commercial/villa-plots/sub-pages), and real per-project content matching
 * the developer's own known brand (Rustomjee) and Mumbai neighbourhoods.
 */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];
const RERA_FALLBACK_PATTERN = /\bP\d{8,10}[A-Z0-9]{0,6}\b/;
const STARTING_PRICE_PATTERN = /Starting\s*₹\s*([\d.]+)\s*(Cr|Lakh|L)\b/i;

interface GraphEntity {
  "@type"?: string | string[];
  [key: string]: unknown;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function hasType(entity: GraphEntity, type: string): boolean {
  return Array.isArray(entity["@type"]) ? entity["@type"].includes(type) : entity["@type"] === type;
}

/**
 * Extracts the escaped `@graph` JSON document from the page's Next.js
 * `<Script>`-injected schema data. Returns null (never throws) when the
 * marker isn't present at all -- the genuinely common case for thinner pages
 * (Part G: confirmed some real pages simply don't carry this blob).
 */
function extractGraph(html: string): GraphEntity[] | null {
  const marker = '"children":"';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  let i = startIdx + marker.length;
  let inEscape = false;
  const chars: string[] = [];
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inEscape) {
      chars.push(ch);
      inEscape = false;
      continue;
    }
    if (ch === "\\") {
      chars.push(ch);
      inEscape = true;
      continue;
    }
    if (ch === '"') break;
    chars.push(ch);
  }

  try {
    const jsString = JSON.parse('"' + chars.join("") + '"') as string;
    const parsed = JSON.parse(jsString) as { "@graph"?: GraphEntity[] };
    return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : null;
  } catch {
    return null;
  }
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Only an exact, unambiguous match against this codebase's own STATUS_LABEL vocabulary -- never a guessed phrasing variant. */
function statusFromExactLabel(label: string): ProjectStatus | null {
  const matches = (Object.keys(STATUS_LABEL) as ProjectStatus[]).filter((s) => STATUS_LABEL[s] === label);
  return matches.length === 1 ? matches[0] : null;
}

export function extractRustomjeeFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};

  // Layer 2 (fallback) first, so layer 1 can overwrite with richer facts when available.
  const titleMatch = html.match(TITLE_PATTERN);
  if (titleMatch) facts.metaTitle = { value: decodeHtmlEntities(titleMatch[1].trim()), confidence: "High" };

  let metaDescription: string | null = null;
  for (const pattern of META_DESCRIPTION_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      metaDescription = decodeHtmlEntities(m[1].trim());
      facts.metaDescription = { value: metaDescription, confidence: "High" };
      break;
    }
  }
  if (metaDescription) {
    facts.tagline = { value: metaDescription, confidence: "Medium", ambiguous: true, note: "Page's own meta description -- marketing prose, needs editorial review." };
    const priceMatch = metaDescription.match(STARTING_PRICE_PATTERN);
    if (priceMatch) {
      facts.priceMin = {
        value: `₹${priceMatch[1]} ${priceMatch[2] === "L" ? "Lakh" : priceMatch[2]}`,
        confidence: "Medium",
        note: `Page's own meta description: "Starting ₹${priceMatch[1]} ${priceMatch[2]}" -- a minimum only, no maximum ever stated.`,
      };
    }
  }

  const reraFallback = html.match(RERA_FALLBACK_PATTERN);
  if (reraFallback) {
    facts.reraNumber = { value: reraFallback[0], confidence: "Medium", note: "Raw-HTML RERA pattern match (no structured @graph data was present on this page)." };
  }

  // Layer 1 (primary): the richer, structured @graph blob, when present.
  const graph = extractGraph(html);
  if (!graph) return facts;

  const listing = graph.find((e) => hasType(e, "RealEstateListing") || hasType(e, "ApartmentComplex"));
  if (!listing) return facts;

  const nameFact = fact(listing.name, "High", { note: "Page's own @graph RealEstateListing.name (Next.js-injected JSON-LD)." });
  if (nameFact) facts.name = nameFact;

  const address = listing.address as { addressLocality?: string } | undefined;
  const localityFact = fact(address?.addressLocality, "High", { note: "Page's own @graph RealEstateListing.address.addressLocality." });
  if (localityFact) facts.locality = localityFact;

  const description = fact(listing.description, "Medium", { ambiguous: true, note: "Page's own @graph RealEstateListing.description -- marketing prose, needs editorial review." });
  if (description) facts.tagline = description;

  const image = listing.image as { url?: string } | undefined;
  const coverFact = fact(image?.url, "High", { note: "Page's own @graph RealEstateListing.image.url." });
  if (coverFact) facts.coverImage = coverFact;

  const amenityFeature = Array.isArray(listing.amenityFeature) ? (listing.amenityFeature as { name?: string; value?: unknown }[]) : [];
  const amenityNames = amenityFeature.filter((a) => a.value === true && typeof a.name === "string").map((a) => a.name as string);
  if (amenityNames.length) {
    facts.amenities = {
      value: `${amenityNames.length} selected`,
      confidence: "High",
      note: `Named list from the page's own @graph amenityFeature array: ${amenityNames.join(", ")}.`,
      items: amenityNames,
    };
  }

  const additionalProperty = Array.isArray(listing.additionalProperty) ? (listing.additionalProperty as { name?: string; value?: string }[]) : [];
  const reraProp = additionalProperty.find((p) => p.name === "MahaRERA Registration");
  if (typeof reraProp?.value === "string" && reraProp.value.trim()) {
    facts.reraNumber = { value: reraProp.value.trim(), confidence: "High", note: "Page's own @graph additionalProperty (MahaRERA Registration) -- overrides the raw-HTML fallback pattern with the structured value." };
  }
  const configProp = additionalProperty.find((p) => p.name === "Configuration");
  if (typeof configProp?.value === "string" && configProp.value.trim()) {
    facts.highlights = { value: `Configuration: ${configProp.value.trim()}`, confidence: "Medium", note: `Page's own @graph additionalProperty (Configuration): "${configProp.value.trim()}".` };
    facts.category = { value: "Residential", confidence: "High", note: "Page's own Configuration property describes residential BHK unit types." };
  }
  const statusProp = additionalProperty.find((p) => p.name === "Property Status");
  if (typeof statusProp?.value === "string") {
    const mapped = statusFromExactLabel(statusProp.value.trim());
    if (mapped) {
      facts.status = { value: STATUS_LABEL[mapped], confidence: "High", note: `Page's own @graph additionalProperty (Property Status): "${statusProp.value.trim()}" -- an exact match to this codebase's ${mapped}.` };
    }
  }

  // Deliberately NOT populated -- confirmed genuinely absent from both real
  // pages inspected during Phase 49 (no field/section exists, not a parsing
  // failure): developerGroup (lives on the organization's own #organization
  // graph node, not this project's listing), builder, priceMax (only a
  // "Starting from" minimum is ever published), possessionMonth/
  // possessionYear, reraStatus, reraCertificateUrl (mentioned in FAQ prose
  // as "published on the project's main page" but never as a direct URL),
  // googleMapsUrl, latitude/longitude, launchDate, actualPossession,
  // constructionPercent, landAreaAcres, totalUnits, totalTowers,
  // paymentPlanType/Description (FAQ prose describes a CLP Pre-EMI plan but
  // not in this codebase's own PAYMENT_PLAN_TYPES vocabulary), specifications,
  // faqs, videoUrl, tour360Url, brochure, documents, images, ogImageUrl.

  return facts;
}

/** Real, live OfficialSourceAdapter for Rustomjee/Keystone Realtors (Phase 49). Same contract as every other adapter here. */
export const rustomjeeAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Rustomjee page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractRustomjeeFacts(html);
  },
};

/** Curated, hand-verified Mumbai residential project pages for Rustomjee (Phase 49). Each was individually confirmed against the developer's own sitemap and real page content -- never guessed. */
export const RUSTOMJEE_OCEAN_VISTA_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-ocean-vista/";
export const RUSTOMJEE_BALMORAL_GOLFLINKS_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-balmoral-golflinks/";
export const RUSTOMJEE_ASHIANA_JUHU_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-ashiana-juhu/";
export const RUSTOMJEE_PARISHRAM_BANDRA_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-parishram-bandra-pali-hill/";
export const RUSTOMJEE_CROWN_PRABHADEVI_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-crown-prabhadevi/";
export const RUSTOMJEE_PRIVE_BKC_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-prive-bkc-annexe/";
export const RUSTOMJEE_ELEMENTS_JUHU_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-elements-juhu/";
export const RUSTOMJEE_ELITA_JUHU_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-elita-juhu/";
export const RUSTOMJEE_SEASONS_BANDRA_BKC_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-seasons-bandra-bkc/";
export const RUSTOMJEE_ADEN_BANDRA_BKC_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-aden-bandra-bkc/";
export const RUSTOMJEE_CLEON_BKC_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-cleon-bkc/";
export const RUSTOMJEE_STELLA_BANDRA_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-stella-bandra/";
export const RUSTOMJEE_VISTA_BAY_PAREL_PROJECT_URL = "https://www.rustomjee.com/projects/residential/vista-bay-parel-extension/";
export const RUSTOMJEE_7_JVPD_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-7-jvpd/";
export const RUSTOMJEE_9_JVPD_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-9-jvpd/";
export const RUSTOMJEE_CLIFF_TOWER_PROJECT_URL = "https://www.rustomjee.com/projects/residential/rustomjee-cliff-tower/";
export const OZONE_SKYE_GOREGAON_WEST_PROJECT_URL = "https://www.rustomjee.com/projects/residential/ozone-skye-goregaon-west/";
