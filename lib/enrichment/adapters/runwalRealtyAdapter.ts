import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 48's Mumbai-wide developer coverage audit,
 * against runwalrealty.com's real markup for the Runwal Sanctuary (Mulund
 * West) project page. A NINTH distinct page shape now proven: MULTIPLE
 * separate `application/ld+json` blocks (Organization, WebSite, WebPage,
 * BreadcrumbList, RealEstateListing, ApartmentComplex, Apartment, FAQPage)
 * -- same multi-block pattern as koltePatilAdapter.ts, but a genuinely
 * different field taxonomy (RealEstateListing.about.address /
 * .identifier.value for a MULTI-TOWER RERA string, ApartmentComplex.
 * additionalProperty for BHK config), confirmed by actually parsing all 8
 * blocks on the real page -- not assumed from koltePatilAdapter's shape.
 *
 * Domain confirmed via: a real Organization JSON-LD (name "Runwal Realty",
 * foundingDate 1978, matching real facebook/instagram/linkedin/youtube
 * profiles), a clean robots.txt, and a real sitemap with dedicated
 * residential-ongoing/upcoming/complete sub-sitemaps listing genuine
 * project pages -- not a lead-gen microsite.
 */
interface JsonLdBlock {
  "@type"?: string;
  [key: string]: unknown;
}

function extractJsonLdBlocks(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(match[1]) as JsonLdBlock);
    } catch {
      /* a malformed block on the page -- skip it, never throw the whole extraction away */
    }
  }
  return blocks;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

export function extractRunwalRealtyFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const blocks = extractJsonLdBlocks(html);

  const listing = blocks.find((b) => b["@type"] === "RealEstateListing");
  const nameFact = fact(listing?.name, "High", { note: "Page's own RealEstateListing.name (JSON-LD)." });
  if (nameFact) facts.name = nameFact;

  const description = typeof listing?.description === "string" ? listing.description : null;
  if (description) {
    facts.tagline = { value: description, confidence: "Medium", ambiguous: true, note: "Page's own RealEstateListing.description (JSON-LD) -- marketing prose, needs editorial review." };
    facts.category = { value: "Residential", confidence: "High", note: "Every page under runwalrealty.com/our-project/residential-* is, by the site's own URL structure, a residential listing." };
  }

  const about = listing?.about as { address?: { streetAddress?: string; addressLocality?: string } } | undefined;
  const localityRaw = about?.address?.addressLocality;
  const localityFact = fact(localityRaw, "High", { note: "Page's own RealEstateListing.about.address.addressLocality (JSON-LD)." });
  if (localityFact) facts.locality = localityFact;

  // This developer's own convention: a SINGLE RERA identifier field can list
  // multiple tower registrations at once (e.g. "TOWER 2 ~ P51800032538, TOWER
  // 4 ~ P51800025926, ..."). Rather than silently pick one and discard the
  // rest, this stores the FIRST registration number found (for the existing
  // single-string reraNumber field) but keeps the note showing the full raw
  // multi-tower string, so a founder reviewing the CONFLICT/YELLOW badge can
  // see there's more to this project's RERA status than one number.
  const identifier = listing?.identifier as { propertyID?: string; value?: string } | undefined;
  if (identifier?.propertyID === "MahaRERA" && typeof identifier.value === "string") {
    const firstReraMatch = identifier.value.match(/P\d{9,11}/);
    if (firstReraMatch) {
      facts.reraNumber = {
        value: firstReraMatch[0],
        confidence: "High",
        ambiguous: identifier.value.includes(","),
        note: `Page's own RealEstateListing.identifier (JSON-LD), MahaRERA: "${identifier.value}".${identifier.value.includes(",") ? " This project has MULTIPLE tower registrations -- only the first is captured here." : ""}`,
      };
    }
  }

  const apartmentComplex = blocks.find((b) => b["@type"] === "ApartmentComplex");
  const bhkProperty = apartmentComplex?.additionalProperty as { name?: string; value?: string } | undefined;
  if (bhkProperty?.name === "BHK" && typeof bhkProperty.value === "string" && bhkProperty.value.trim()) {
    facts.highlights = { value: `Configuration: ${bhkProperty.value.trim()}`, confidence: "Medium", note: `Page's own ApartmentComplex.additionalProperty (BHK): "${bhkProperty.value.trim()}".` };
  }

  // Deliberately NOT populated -- confirmed genuinely absent from the real
  // page inspected during Phase 48 (no field/section exists, not a parsing
  // failure): developerGroup (lives on the organization JSON-LD, not this
  // project's own listing), builder, priceMin/priceMax (this developer does
  // not publish pricing publicly -- "discuss possession timelines directly"
  // is the closest text found, and it names no actual date), possessionMonth/
  // possessionYear, reraStatus, reraCertificateUrl, googleMapsUrl,
  // latitude/longitude, launchDate, actualPossession, constructionPercent,
  // landAreaAcres, totalUnits, totalTowers, amenities (no discrete named
  // list on this page, only a numeric "40+ lifestyle amenities" claim inside
  // the description prose), status, paymentPlanType/Description,
  // specifications, faqs, videoUrl, tour360Url, brochure, documents, images,
  // metaTitle/metaDescription, ogImageUrl.

  return facts;
}

/** Real, live OfficialSourceAdapter for Runwal Realty (Phase 48). Same contract as every other adapter here. */
export const runwalRealtyAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Runwal Realty page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractRunwalRealtyFacts(html);
  },
};

/** Curated project pages this MVP knows how to enrich for Runwal Realty (Phase 48), hand-verified as real Mumbai residential projects on the developer's own site. */
export const RUNWAL_SANCTUARY_PROJECT_URL = "https://runwalrealty.com/our-project/residential-ongoing/runwal-sanctuary/";
