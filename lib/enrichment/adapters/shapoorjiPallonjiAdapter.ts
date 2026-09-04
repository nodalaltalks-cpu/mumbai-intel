import { STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 53 against shapoorjirealestate.com's real markup,
 * across 6 real distinct Mumbai project pages (Heartland, The Odyssey, Nine
 * Arcs, BKC 9, BKC 28, Codename NP 1.2). A TWELFTH distinct page shape, and
 * genuinely the most STRUCTURALLY INCONSISTENT one seen so far -- confirmed
 * by actually diffing the JSON-LD across all 6 pages before deciding one
 * adapter (not several) was still the right call:
 *  - Heartland: `@graph` with an ApartmentComplex + Product node.
 *  - The Odyssey: `@graph` with a RealEstateListing + ApartmentComplex node.
 *  - Codename NP 1.2: `@graph` with a Product + BreadcrumbList + FAQPage node.
 *  - BKC 9 / BKC 28 / Nine Arcs: a single FLAT `Product` object, no `@graph`.
 * Despite the shape differences, every page carries real, parseable JSON-LD
 * and a shared site-wide `data-project-name`/`data-project-location`
 * attribute pair on the `<html>` tag itself -- that consistency (not any one
 * JSON-LD shape) is what justifies ONE adapter here: it normalizes every
 * script block into a flat node list first, then reads whatever fields each
 * page's own nodes actually have, never assuming a fixed shape.
 *
 * Three real findings this adapter handles honestly:
 *
 * 1. RERA numbers are NOT inside the JSON-LD's `additionalProperty` on most
 *    pages (only Heartland and Codename NP 1.2 have one) -- on BKC 9, BKC 28,
 *    Nine Arcs, and The Odyssey the real RERA number only appears as plain
 *    text elsewhere on the page (an FAQ answer, a disclaimer line). This
 *    adapter therefore always extracts RERA via a page-wide raw-HTML regex
 *    (comment-stripped), the same discipline as rustomjeeAdapter/
 *    sunteckAdapter's own fallback layer, rather than depending on any one
 *    JSON-LD field. Real Maharashtra RERA numbers on this site use two
 *    distinct prefixes ("P5180...", "PM1181...", "PR1180...") -- the regex
 *    below was widened to catch all three shapes actually observed, not
 *    guessed. Codename NP 1.2 genuinely has TWO (Wing A/Wing B) -- handled
 *    the same way Sunteck Sky Park's multi-RERA page was (first value +
 *    ambiguous flag + full list in the note).
 * 2. No project page states a construction-stage "status" as a discrete
 *    structured field -- it only ever appears (when it appears at all) as
 *    prose inside a real `FAQPage` JSON-LD answer (e.g. BKC 9: "As of August
 *    2024, BKC 9 is under construction..."; The Odyssey: "...currently under
 *    construction, with possession expected by Oct 2030"). This adapter scans
 *    every FAQ answer for an unambiguous "under construction"/"ready to
 *    move" phrase rather than inventing a status field that doesn't exist;
 *    Heartland, Nine Arcs, BKC 28, and Codename NP 1.2 have no such FAQ
 *    sentence at all, so `status` is honestly left MISSING for those.
 * 3. "Codename Zest" (an internal pre-launch codename) 301-redirects straight
 *    to "Heartland" (the launched marketing name) -- and a "The Minerva" URL
 *    listed on the developer's OWN Mumbai project index page 301-redirects
 *    straight to the homepage (no real project page exists there at all).
 *    Both are real, disclosed findings for whoever curates CURATED_SOURCES's
 *    project map, not this adapter's own concern (it only ever receives one
 *    already-resolved URL).
 */
const RERA_NUMBER_PATTERN = /\bP[A-Z]?\d{9,13}\b/g;
const PROJECT_LOCATION_ATTR_PATTERN = /data-project-location="([^"]+)"/;

interface JsonLdNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

function hasType(node: JsonLdNode, type: string): boolean {
  return Array.isArray(node["@type"]) ? node["@type"].includes(type) : node["@type"] === type;
}

/** Flattens every `<script type="application/ld+json">` block on the page into one flat node list, expanding any `@graph` array -- normalizes the 4 real shapes this developer's own pages use into one thing callers can search uniformly. */
function extractJsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed?.["@graph"])) nodes.push(...(parsed["@graph"] as JsonLdNode[]));
      else if (parsed && typeof parsed === "object") nodes.push(parsed as JsonLdNode);
    } catch {
      // Skip a malformed block rather than fail the whole page.
    }
  }
  return nodes;
}

function findNode(nodes: JsonLdNode[], type: string): JsonLdNode | undefined {
  return nodes.find((n) => hasType(n, type));
}

function firstAdditionalPropertyValue(nodes: JsonLdNode[], propertyName: string): string | undefined {
  for (const node of nodes) {
    const props = Array.isArray(node.additionalProperty) ? (node.additionalProperty as { name?: string; value?: unknown }[]) : [];
    const hit = props.find((p) => p.name === propertyName);
    if (typeof hit?.value === "string" && hit.value.trim()) return hit.value.trim();
  }
  return undefined;
}

function extractReraNumbers(commentFreeHtml: string): RawSourceFact | undefined {
  const found = [...new Set(commentFreeHtml.match(RERA_NUMBER_PATTERN) ?? [])];
  if (found.length === 0) return undefined;
  if (found.length === 1) return { value: found[0], confidence: "High", note: "Page-wide RERA number pattern match (only one distinct value found)." };
  return {
    value: found[0],
    confidence: "Medium",
    ambiguous: true,
    note: `Page lists ${found.length} distinct RERA-shaped numbers (likely a multi-wing/tower project): ${found.join(", ")}. First shown; confirm the wing-specific number before relying on it.`,
  };
}

/** Only an exact, unambiguous match against this codebase's own STATUS_LABEL vocabulary -- same discipline as every other adapter's statusFromExactLabel. */
function statusFromExactLabel(label: string): ProjectStatus | null {
  const matches = (Object.keys(STATUS_LABEL) as ProjectStatus[]).filter((s) => STATUS_LABEL[s] === label);
  return matches.length === 1 ? matches[0] : null;
}

/** No page publishes a discrete status field -- when a status IS discoverable at all, it is one sentence inside a real FAQPage answer (Part O: never fabricate). Scans every FAQ answer's text for an unambiguous phrase rather than assuming any one question is always present. */
function extractStatusFromFaq(nodes: JsonLdNode[]): RawSourceFact | undefined {
  const faqPage = findNode(nodes, "FAQPage");
  const questions = Array.isArray(faqPage?.mainEntity) ? (faqPage?.mainEntity as { acceptedAnswer?: { text?: string } }[]) : [];
  for (const q of questions) {
    const text = q.acceptedAnswer?.text;
    if (typeof text !== "string") continue;
    const lower = text.toLowerCase();
    if (lower.includes("ready to move") || lower.includes("ready for possession")) {
      const mapped = statusFromExactLabel("Ready to Move");
      if (mapped) return { value: STATUS_LABEL[mapped], confidence: "High", note: `Page's own FAQ answer: "${text.trim()}"` };
    }
    if (lower.includes("under construction")) {
      const mapped = statusFromExactLabel("Under Construction");
      if (mapped) return { value: STATUS_LABEL[mapped], confidence: "High", note: `Page's own FAQ answer: "${text.trim()}"` };
    }
  }
  return undefined;
}

export function extractShapoorjiPallonjiFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const commentFree = stripHtmlComments(html);
  const nodes = extractJsonLdNodes(commentFree);

  const reraNumber = extractReraNumbers(commentFree);
  if (reraNumber) facts.reraNumber = reraNumber;

  const status = extractStatusFromFaq(nodes);
  if (status) facts.status = status;

  const primaryNode = findNode(nodes, "ApartmentComplex") ?? findNode(nodes, "RealEstateListing") ?? findNode(nodes, "Product");
  const nameFact = fact(primaryNode?.name, "High", { note: "Page's own JSON-LD (ApartmentComplex/RealEstateListing/Product) name." });
  if (nameFact) facts.name = nameFact;

  const locationProperty = firstAdditionalPropertyValue(nodes, "Location");
  const apartmentComplex = findNode(nodes, "ApartmentComplex");
  const address = apartmentComplex?.address as { addressLocality?: string } | undefined;
  const htmlAttrLocation = commentFree.match(PROJECT_LOCATION_ATTR_PATTERN)?.[1];

  const localityFact =
    fact(locationProperty, "High", { note: "Page's own JSON-LD additionalProperty (Location)." }) ??
    fact(address?.addressLocality, "High", { note: "Page's own JSON-LD address.addressLocality." }) ??
    fact(htmlAttrLocation, "Medium", { note: "Page's own site-wide data-project-location HTML attribute (no more specific JSON-LD locality field was present)." });
  if (localityFact) facts.locality = localityFact;

  const descriptionSource = primaryNode?.description ?? findNode(nodes, "RealEstateListing")?.description;
  const description = fact(descriptionSource, "Medium", { ambiguous: true, note: "Page's own JSON-LD description -- marketing prose, needs editorial review." });
  if (description) facts.tagline = description;

  const imageSource = primaryNode?.image;
  const coverImageValue = Array.isArray(imageSource) ? imageSource.find((i) => typeof i === "string") : imageSource;
  const coverImage = fact(coverImageValue, "High", { note: "Page's own JSON-LD image field." });
  if (coverImage) facts.coverImage = coverImage;

  const amenityFeature = Array.isArray(apartmentComplex?.amenityFeature) ? (apartmentComplex?.amenityFeature as { name?: string; value?: unknown }[]) : [];
  const amenityNames = amenityFeature.filter((a) => a.value !== false && typeof a.name === "string").map((a) => a.name as string);
  if (amenityNames.length) {
    facts.amenities = {
      value: `${amenityNames.length} selected`,
      confidence: "High",
      note: `Named list from the page's own JSON-LD amenityFeature array: ${amenityNames.join(", ")}.`,
      items: amenityNames,
    };
  }

  const offers = primaryNode?.offers as { price?: string; lowPrice?: string } | undefined;
  const priceValue = offers?.price ?? offers?.lowPrice;
  if (typeof priceValue === "string" && priceValue.trim() && !Number.isNaN(Number(priceValue))) {
    const rupees = Number(priceValue);
    facts.priceMin = {
      value: rupees >= 10000000 ? `₹${(rupees / 10000000).toFixed(2)} Cr` : `₹${(rupees / 100000).toFixed(2)} Lakh`,
      confidence: "Medium",
      note: `Page's own JSON-LD offers price (raw: ₹${priceValue}) -- a "starting from" minimum only, no maximum ever stated.`,
    };
  }

  // Deliberately NOT populated -- confirmed genuinely absent/unstructured
  // across every real page inspected in Phase 53: developerGroup/builder (the
  // Brand node is always the umbrella "Shapoorji Pallonji Real Estate", not a
  // per-project fact), possessionMonth/possessionYear (only ever
  // prose inside an FAQ answer, e.g. "possession expected by Oct 2030" -- too
  // free-form to parse into a reliable month/year without guessing),
  // reraCertificateUrl, googleMapsUrl,
  // launchDate, actualPossession, constructionPercent, landAreaAcres,
  // totalUnits, totalTowers, paymentPlanType (Codename NP 1.2's own "20 X 5
  // Yearly Payment Plan" text doesn't match this codebase's
  // PAYMENT_PLAN_TYPES vocabulary), specifications, faqs, videoUrl,
  // tour360Url, brochure, documents, category.

  return facts;
}

/** Real, live OfficialSourceAdapter for Shapoorji Pallonji Real Estate (Phase 53). Same contract as every other adapter here. */
export const shapoorjiPallonjiAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Shapoorji Pallonji page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractShapoorjiPallonjiFacts(html);
  },
};

/** Curated, hand-verified CURRENT Mumbai-city Shapoorji Pallonji project pages (Phase 53). Each individually confirmed against the developer's own Mumbai project index page and real page content. */
export const SP_HEARTLAND_PROJECT_URL = "https://shapoorjirealestate.com/residential/heartland/";
export const SP_THE_ODYSSEY_PROJECT_URL = "https://shapoorjirealestate.com/residential/the-odyssey/";
export const SP_NINE_ARCS_PROJECT_URL = "https://shapoorjirealestate.com/residential/nine-arcs/";
export const SP_BKC_9_PROJECT_URL = "https://shapoorjirealestate.com/residential/bkc-9/";
export const SP_BKC_28_PROJECT_URL = "https://shapoorjirealestate.com/residential/bkc-28/";
export const SP_CODENAME_NP_1_2_PROJECT_URL = "https://shapoorjirealestate.com/residential/codename-np-1-2/";
