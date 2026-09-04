import { STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 54 against piramalrealty.com's real markup,
 * across all 3 of the developer's genuine current Mumbai-city residential
 * projects (Mahalaxmi, Aranya, Revanta) -- thirteenth developer. Unlike
 * Phase 53's Shapoorji Pallonji finding, this developer's pages carry real,
 * rich `application/ld+json` throughout (Organization, Brand, WebPage,
 * ApartmentComplex, RealEstateListing, BreadcrumbList, VideoObject,
 * FAQPage) -- confirmed by inspecting all 3 pages' raw JSON-LD before
 * writing this adapter, not assumed from the site's general polish.
 *
 * Two real findings this adapter handles honestly:
 *
 * 1. Locality lives in a SPECIFIC place: the site emits TWO different
 *    LocalBusiness-shaped nodes per page. The generic `RealEstateListing`
 *    node's own `address.addressLocality` is always the coarse "Mumbai" on
 *    every page checked -- useless for locality resolution. The OTHER node
 *    (`@type` includes "LocalBusiness", `@id` ending in "#localbusiness")
 *    carries the real specific neighbourhood ("Mahalaxmi", "Byculla",
 *    "Mulund"). This adapter reads ONLY that second node for locality, never
 *    the generic one. Mulund is a real finding of its own: the LocalBusiness
 *    node says the bare "Mulund" (ambiguous between this codebase's existing
 *    "Mulund East"/"Mulund West" localities), but the SAME node's own
 *    `streetAddress` field states "Mulund West" explicitly -- this adapter
 *    checks for that directional suffix in the street address and prefers it
 *    over the bare LocalBusiness locality when present, rather than passing
 *    through an ambiguous bare name that would force a founder decision this
 *    page's own data already resolves.
 * 2. Every one of this developer's 3 real Mumbai projects is a genuine
 *    multi-tower development with a MIX of delivered and still-active
 *    towers (e.g. Aranya: Avyan/Arav delivered, Ahan I/Ahan II under
 *    construction) -- there is no single-field "project status" anywhere on
 *    any page. The real, only place construction stage is stated at all is
 *    prose inside the page's own real `FAQPage` answers (a per-tower
 *    delivered/under-construction breakdown, e.g. Aranya: "Ahan I (under
 *    construction, MahaRERA P51900020330) and Ahan II (under construction,
 *    MahaRERA P51900051735)"). This adapter scans every FAQ answer for
 *    unambiguous "under construction" phrasing (or, per the real Mahalaxmi
 *    finding, "topped out" combined with "finishing"/"underway" -- structure
 *    complete but not yet handed over) and reports UNDER_CONSTRUCTION only
 *    when that active-tower evidence is found; a project whose FAQ prose
 *    only ever says "delivered"/"ready" for every tower is NOT
 *    over-eagerly marked Ready to Move by this adapter (none of the 3 real
 *    projects checked hit that case, but the discipline exists so a future
 *    fully-delivered Piramal project is never misclassified).
 *
 * Every one of these 3 real pages lists multiple genuine RERA numbers (one
 * per tower, delivered towers included) -- same multi-RERA/ambiguous-flag
 * handling already established by sunteckAdapter.ts and
 * shapoorjiPallonjiAdapter.ts, reused verbatim here rather than reinvented.
 */
const RERA_NUMBER_PATTERN = /\bP[A-Z]?\d{9,13}\b/g;

interface JsonLdNode {
  "@type"?: string | string[];
  "@id"?: string;
  [key: string]: unknown;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

function hasType(node: JsonLdNode, type: string): boolean {
  return Array.isArray(node["@type"]) ? node["@type"].includes(type) : node["@type"] === type;
}

/** Flattens every real `<script type="application/ld+json">` block on the page into one flat node list -- this developer's pages never use `@graph` (unlike Shapoorji Pallonji's), but reusing the same normalize-first discipline keeps every adapter in this codebase consistent and safe against a future page that does. */
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

/** The specific-locality node -- see this file's doc comment, finding 1. Matched by @id suffix, not just @type, since the generic RealEstateListing node ALSO carries "LocalBusiness" in some pages' @type array. */
function findLocalBusinessNode(nodes: JsonLdNode[]): JsonLdNode | undefined {
  return nodes.find((n) => hasType(n, "LocalBusiness") && typeof n["@id"] === "string" && (n["@id"] as string).includes("localbusiness"));
}

function extractReraNumbers(html: string): RawSourceFact | undefined {
  const found = [...new Set(html.match(RERA_NUMBER_PATTERN) ?? [])];
  if (found.length === 0) return undefined;
  if (found.length === 1) return { value: found[0], confidence: "High", note: "Page-wide RERA number pattern match (only one distinct value found)." };
  return {
    value: found[0],
    confidence: "Medium",
    ambiguous: true,
    note: `Page lists ${found.length} distinct RERA-shaped numbers (a real multi-tower project, one RERA per tower): ${found.join(", ")}. First shown; confirm the specific tower's number before relying on it.`,
  };
}

function statusFromExactLabel(label: string): ProjectStatus | null {
  const matches = (Object.keys(STATUS_LABEL) as ProjectStatus[]).filter((s) => STATUS_LABEL[s] === label);
  return matches.length === 1 ? matches[0] : null;
}

/** No page publishes a single discrete status field for the whole multi-tower project -- when active-tower construction stage IS discoverable, it is prose inside a real FAQPage answer (Part O: never fabricate). See finding 2. */
function extractStatusFromFaq(nodes: JsonLdNode[]): RawSourceFact | undefined {
  const faqPage = findNode(nodes, "FAQPage");
  const questions = Array.isArray(faqPage?.mainEntity) ? (faqPage?.mainEntity as { acceptedAnswer?: { text?: string } }[]) : [];
  for (const q of questions) {
    const text = q.acceptedAnswer?.text;
    if (typeof text !== "string") continue;
    const lower = text.toLowerCase();
    if (lower.includes("under construction")) {
      const mapped = statusFromExactLabel("Under Construction");
      if (mapped) return { value: STATUS_LABEL[mapped], confidence: "High", note: `Page's own FAQ answer: "${text.trim()}"` };
    }
    if (lower.includes("topped out") && (lower.includes("finishing") || lower.includes("underway"))) {
      const mapped = statusFromExactLabel("Under Construction");
      if (mapped) {
        return {
          value: STATUS_LABEL[mapped],
          confidence: "High",
          note: `Page's own FAQ answer describes a topped-out tower still mid-finishing (not yet delivered): "${text.trim()}"`,
        };
      }
    }
  }
  return undefined;
}

/** Finding 1's Mulund case: prefers a directional East/West suffix found in the LocalBusiness node's own streetAddress over the bare locality name, when that suffix genuinely appears there -- never invented when the street address doesn't actually contain it. */
function refineLocalityWithDirection(bareLocality: string, streetAddress: string | undefined): { value: string; note: string } | null {
  if (!streetAddress) return null;
  const east = new RegExp(`${bareLocality}\\s+East\\b`, "i");
  const west = new RegExp(`${bareLocality}\\s+West\\b`, "i");
  if (west.test(streetAddress)) return { value: `${bareLocality} West`, note: `Directional suffix "${bareLocality} West" found in the page's own street address (LocalBusiness locality alone was the bare "${bareLocality}").` };
  if (east.test(streetAddress)) return { value: `${bareLocality} East`, note: `Directional suffix "${bareLocality} East" found in the page's own street address (LocalBusiness locality alone was the bare "${bareLocality}").` };
  return null;
}

export function extractPiramalRealtyFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const nodes = extractJsonLdNodes(html);

  const reraNumber = extractReraNumbers(html);
  if (reraNumber) facts.reraNumber = reraNumber;

  const status = extractStatusFromFaq(nodes);
  if (status) facts.status = status;

  const apartmentComplex = findNode(nodes, "ApartmentComplex");
  const realEstateListing = findNode(nodes, "RealEstateListing");

  const nameFact = fact(apartmentComplex?.name, "High", { note: "Page's own JSON-LD ApartmentComplex name." });
  if (nameFact) facts.name = nameFact;

  const localBusiness = findLocalBusinessNode(nodes);
  const localBusinessAddress = localBusiness?.address as { addressLocality?: string; streetAddress?: string } | undefined;
  const bareLocality = localBusinessAddress?.addressLocality;
  const refined = typeof bareLocality === "string" ? refineLocalityWithDirection(bareLocality, localBusinessAddress?.streetAddress) : null;

  const localityFact = refined
    ? { value: refined.value, confidence: "High" as EnrichmentConfidence, note: refined.note }
    : fact(bareLocality, "High", { note: "Page's own JSON-LD LocalBusiness node's address.addressLocality (the specific-neighbourhood node, not the generic RealEstateListing node which only ever states the coarse city)." });
  if (localityFact) facts.locality = localityFact;

  const description = fact(apartmentComplex?.description, "Medium", { ambiguous: true, note: "Page's own JSON-LD ApartmentComplex description -- marketing prose, needs editorial review." });
  if (description) facts.tagline = description;

  const imageSource = realEstateListing?.image;
  const coverImageValue = Array.isArray(imageSource) ? imageSource.find((i) => typeof i === "string") : imageSource;
  const coverImage = fact(coverImageValue, "High", { note: "Page's own JSON-LD RealEstateListing image field." });
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

  // Deliberately NOT populated -- confirmed genuinely absent/unstructured
  // across all 3 real pages inspected in Phase 54: developerGroup/builder
  // (the Organization/Brand node is always the umbrella "Piramal Realty",
  // not a per-project fact, same discipline as every other curated
  // developer here), priceMin (no offers/price field anywhere in
  // any of the 3 pages' real JSON-LD -- this developer's pages simply never
  // publish a price), possessionMonth/possessionYear (only ever prose
  // inside an FAQ answer per-tower, e.g. "possession expected by November
  // 2028" for one tower and "July 2030" for another on the SAME project --
  // too tower-specific and free-form to collapse into one project-level
  // month/year without guessing which tower),
  // reraCertificateUrl, googleMapsUrl, launchDate, actualPossession,
  // constructionPercent, landAreaAcres, totalUnits, totalTowers (stated only
  // as narrative prose, e.g. "three high-rise towers", never a clean
  // integer field), paymentPlanType, specifications, faqs, videoUrl (the
  // real VideoObject blocks are YouTube trailers/show-flat tours, not a
  // documents/brochure asset), tour360Url, brochure, documents, category.
  return facts;
}

/** Real, live OfficialSourceAdapter for Piramal Realty (Phase 54). Same contract as every other adapter here. */
export const piramalRealtyAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Piramal Realty page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractPiramalRealtyFacts(html);
  },
};

/** Curated, hand-verified CURRENT Mumbai-city Piramal Realty project pages (Phase 54). Each individually confirmed against the developer's own homepage listing and real page content -- the full, non-truncated set: this developer has exactly these 3 genuine current Mumbai-city residential projects (Piramal Vaikunth is Thane/MMR, excluded; Piramal Corporate Park is commercial-only, excluded). */
export const PIRAMAL_MAHALAXMI_PROJECT_URL = "https://www.piramalrealty.com/piramal-mahalaxmi";
export const PIRAMAL_ARANYA_PROJECT_URL = "https://www.piramalrealty.com/piramal-aranya";
export const PIRAMAL_REVANTA_PROJECT_URL = "https://www.piramalrealty.com/piramal-revanta";
