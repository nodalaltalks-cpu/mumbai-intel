import { STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 52 against sunteckindia.com's own markup, across
 * 16 real distinct project pages (Signature Island, Signia Pearl/Isles/
 * Waterfront, 1st & 2nd Avenue, 4th Avenue, Sky Park, Kalyan Harbour, Gilbird,
 * Altavia, SBR, West/Maxx/One/Ultra World). An ELEVENTH distinct page shape,
 * and by far the simplest so far: every page carries LITERAL
 * `<script type="application/ld+json">` blocks (no escaping, no Next.js
 * `<Script>` indirection like Rustomjee) with a `RealEstateListing` ->
 * `mainEntity` (`ApartmentComplex`) node exposing `name` and
 * `address.addressLocality`/`streetAddress` directly. One shared adapter
 * covers every project -- confirmed by actually diffing this structure across
 * 4 sampled pages spanning 4 different areas (BKC, Goregaon West, Naigaon
 * East, Andheri West); see Part C requirement to prove sharing before writing
 * one adapter instead of per-project ones.
 *
 * Two real findings this adapter must handle honestly:
 *
 * 1. STATUS lives in a plain `<div class="possesionlogo">TEXT</div>` banner
 *    badge -- but on the real "Sunteck Kalyan Harbour" page this exact div is
 *    HTML-COMMENTED OUT (`<!--<div class="possesionlogo">OC Received</div>-->`),
 *    i.e. present in the raw markup but genuinely not rendered/asserted by the
 *    developer. A naive substring search would misread the commented-out text
 *    as a live claim; this adapter strips HTML comments FIRST, so a disabled
 *    badge correctly produces no status fact rather than a false one.
 * 2. "Crescent Park" (found in the sitemap) is not a distinct project at all
 *    -- sunteckindia.com/crescent-park 301-redirects straight to
 *    sunteckindia.com/sunteck-kalyan-harbour/. That's real, source-provided
 *    duplicate evidence (not this adapter's job to encode, since it only ever
 *    receives a single already-resolved projectUrl -- documented here for
 *    whoever curates CURATED_SOURCES's project map so "Crescent Park" is never
 *    entered as its own separate curated URL).
 *
 * Only two of Sunteck's own 16 current Mumbai-area pages resolve to an
 * existing Mumbai-CITY Locality this codebase already knows (4th Avenue and
 * Altavia, both Goregaon West) -- Mira Road, Naigaon (East), Vasai (West),
 * Kalyan, and Airoli are real areas on Sunteck's own pages but sit outside
 * Mumbai city proper (MMR periphery), exactly like Phase 51's Thane/Dombivli/
 * Virar precedent. This adapter still extracts their real facts faithfully;
 * it is the LOCALITY resolver (Part L, unchanged) that correctly returns
 * NO_MATCH for them, not this file.
 */
const RERA_NUMBER_PATTERN = /\bP\d{11}\b/g;

interface JsonLdNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

/** Strips HTML comments before any text search -- the one thing that makes the Kalyan Harbour false-positive (a disabled status badge) impossible to mis-read as live. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Only an exact, unambiguous match against this codebase's own STATUS_LABEL vocabulary -- never a guessed phrasing variant (same discipline as rustomjeeAdapter's statusFromExactLabel). */
function statusFromExactLabel(label: string): ProjectStatus | null {
  const matches = (Object.keys(STATUS_LABEL) as ProjectStatus[]).filter((s) => STATUS_LABEL[s] === label);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Sunteck's own possession badge uses wording that doesn't always match this
 * codebase's STATUS_LABEL strings verbatim. "Under Construction" happens to
 * be an exact match (handled by statusFromExactLabel above); "OC Received"
 * (Occupancy Certificate already issued) does not appear in STATUS_LABEL at
 * all, but has one unambiguous real-world meaning -- construction is complete
 * and the project is at/past handover. Mapped here explicitly (never silently
 * guessed) to DELIVERED, the closest existing status this codebase has for
 * "already has its OC" (Part B then correctly classifies this as
 * COMPLETED/EXCLUDE downstream).
 */
const POSSESSION_BADGE_TO_STATUS: Record<string, ProjectStatus> = {
  "OC Received": "DELIVERED",
};

function extractPossessionBadgeStatus(commentFreeHtml: string): RawSourceFact | undefined {
  const match = commentFreeHtml.match(/class="possesionlogo">\s*([^<]+?)\s*</);
  if (!match) return undefined;
  const label = match[1].trim();
  const exact = statusFromExactLabel(label);
  if (exact) {
    return { value: STATUS_LABEL[exact], confidence: "High", note: `Page's own live possession badge: "${label}" -- an exact match to this codebase's ${exact}.` };
  }
  const mapped = POSSESSION_BADGE_TO_STATUS[label];
  if (mapped) {
    return {
      value: STATUS_LABEL[mapped],
      confidence: "Medium",
      note: `Page's own live possession badge: "${label}" -- interpreted as ${mapped} (Occupancy Certificate already issued), not an exact STATUS_LABEL match.`,
    };
  }
  return { value: label, confidence: "Low", ambiguous: true, note: `Page's own live possession badge: "${label}" -- no confident mapping to this codebase's status vocabulary; needs founder review.` };
}

function extractReraNumbers(commentFreeHtml: string): RawSourceFact | undefined {
  const found = [...new Set(commentFreeHtml.match(RERA_NUMBER_PATTERN) ?? [])];
  if (found.length === 0) return undefined;
  if (found.length === 1) {
    return { value: found[0], confidence: "High", note: "Page's own single RERA Number badge." };
  }
  return {
    value: found[0],
    confidence: "Medium",
    ambiguous: true,
    note: `Page lists ${found.length} distinct RERA numbers (multi-tower/multi-phase project): ${found.join(", ")}. First shown; confirm the tower-specific number before relying on it.`,
  };
}

function findNode(nodes: JsonLdNode[], type: string): JsonLdNode | undefined {
  return nodes.find((n) => (Array.isArray(n["@type"]) ? n["@type"].includes(type) : n["@type"] === type));
}

function extractJsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && typeof parsed === "object") nodes.push(parsed as JsonLdNode);
    } catch {
      // Skip a malformed block rather than fail the whole page.
    }
  }
  return nodes;
}

export function extractSunteckFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const commentFree = stripHtmlComments(html);

  const status = extractPossessionBadgeStatus(commentFree);
  if (status) facts.status = status;

  const reraNumber = extractReraNumbers(commentFree);
  if (reraNumber) facts.reraNumber = reraNumber;

  const nodes = extractJsonLdNodes(commentFree);
  const listing = findNode(nodes, "RealEstateListing");
  const mainEntity = listing?.mainEntity as JsonLdNode | undefined;
  const apartmentComplex = mainEntity && (Array.isArray(mainEntity["@type"]) ? mainEntity["@type"].includes("ApartmentComplex") : mainEntity["@type"] === "ApartmentComplex") ? mainEntity : undefined;

  const nameSource = apartmentComplex?.name ?? listing?.name;
  const nameFact = fact(nameSource, "High", { note: "Page's own JSON-LD RealEstateListing/ApartmentComplex name." });
  if (nameFact) facts.name = nameFact;

  const address = apartmentComplex?.address as { addressLocality?: string; streetAddress?: string } | undefined;
  const localityFact = fact(address?.addressLocality, "High", { note: "Page's own JSON-LD address.addressLocality." });
  if (localityFact) facts.locality = localityFact;

  const description = fact(listing?.description, "Medium", { ambiguous: true, note: "Page's own JSON-LD RealEstateListing.description -- marketing prose, needs editorial review." });
  if (description) facts.tagline = description;

  const images = Array.isArray(listing?.image) ? (listing?.image as unknown[]).filter((i): i is string => typeof i === "string") : [];
  if (images.length) facts.coverImage = { value: images[0], confidence: "High", note: "First entry of the page's own JSON-LD image array." };

  const amenityFeature = Array.isArray(apartmentComplex?.amenityFeature) ? (apartmentComplex?.amenityFeature as { name?: string }[]) : [];
  const amenityNames = amenityFeature.map((a) => a.name).filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  if (amenityNames.length) {
    facts.amenities = {
      value: `${amenityNames.length} selected`,
      confidence: "High",
      note: `Named list from the page's own JSON-LD amenityFeature array: ${amenityNames.join(", ")}.`,
      items: amenityNames,
    };
  }

  // Deliberately NOT populated -- confirmed genuinely absent/unstructured
  // across every real page inspected in Phase 52: developerGroup/builder
  // (the Organization node is always the umbrella "Sunteck Realty", not a
  // per-project fact), priceMin/priceMax (no price ever published on these
  // pages), possessionMonth/possessionYear, reraStatus, reraCertificateUrl,
  // googleMapsUrl, latitude/longitude, launchDate, actualPossession,
  // constructionPercent, landAreaAcres, totalUnits, totalTowers,
  // paymentPlanType/Description, specifications, faqs, videoUrl, tour360Url,
  // brochure, documents, category (never separately declared as
  // Residential/Commercial in structured data -- inferred elsewhere, not by
  // this adapter).

  return facts;
}

/** Real, live OfficialSourceAdapter for Sunteck Realty (Phase 52). Same contract as every other adapter here. */
export const sunteckAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Sunteck page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractSunteckFacts(html);
  },
};

/** Curated, hand-verified Mumbai-city-relevant Sunteck Realty project pages (Phase 52). Each individually confirmed against the developer's own sitemap and real page content. */
export const SUNTECK_4TH_AVENUE_PROJECT_URL = "https://www.sunteckindia.com/4th-avenue";
export const SUNTECK_ALTAVIA_PROJECT_URL = "https://www.sunteckindia.com/sunteck-altavia";
