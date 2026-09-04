import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";
import { POSSESSION_MONTH_LABEL } from "@/lib/project-meta";

const FETCH_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";

/**
 * Verified live during Phase 47 against koltepatil.com's real markup for the
 * Serenova (Versova, Andheri West) project page. An EIGHTH distinct page
 * shape now proven: a page carrying MULTIPLE separate `application/ld+json`
 * blocks (ImageObject, Place, Apartment, RealEstateListing, FloorPlan,
 * BreadcrumbList, WebPage, FAQPage) rather than one single project object --
 * confirmed by actually parsing all 8 blocks on the real page. The project's
 * own marketing headline ("Thoughtfully Designed 2 & 3 Bed Residences,
 * Versova") is NOT the project's real name; the real short name ("Serenova")
 * only appears in the BreadcrumbList's second entry ("Serenova - Kolte
 * Patil") -- using the more specific, structured breadcrumb name rather than
 * the marketing headline or a fragile <title> regex.
 */
interface JsonLdBlock {
  "@type"?: string;
  [key: string]: unknown;
}

const RERA_PATTERN = /RERA\s*No\.?\s*(PR?\d{9,13})/i;
const POSSESSION_PATTERN = /Possession\s+([A-Za-z]+)\s+(\d{4})/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractJsonLdBlocks(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(match[1]) as JsonLdBlock);
    } catch {
      /* a malformed block on the page -- skip it, never throw the whole extraction away for one bad block */
    }
  }
  return blocks;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Maps a possession month name (as free text on the page, e.g. "Dec") onto this codebase's own POSSESSION_MONTH_LABEL vocabulary -- only an exact/unambiguous match, never a guess at which month was meant. */
function resolvePossessionMonthLabel(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  const idx = POSSESSION_MONTH_LABEL.findIndex((label) => label && (label.toLowerCase() === normalized || label.toLowerCase().startsWith(normalized)));
  return idx >= 0 ? POSSESSION_MONTH_LABEL[idx] : null;
}

export function extractKoltePatilFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const blocks = extractJsonLdBlocks(html);

  const breadcrumb = blocks.find((b) => b["@type"] === "BreadcrumbList");
  const items = (breadcrumb?.itemListElement as { name?: string }[] | undefined) ?? [];
  const projectCrumb = items[items.length - 1]?.name;
  if (typeof projectCrumb === "string") {
    const shortName = decodeHtmlEntities(projectCrumb.replace(/\s*-\s*Kolte Patil\s*$/i, "").trim());
    const nameFact = fact(shortName, "High", { note: `Page's own BreadcrumbList structured data (JSON-LD): "${projectCrumb}".` });
    if (nameFact) facts.name = nameFact;
  }

  const listing = blocks.find((b) => b["@type"] === "RealEstateListing");
  const description = typeof listing?.description === "string" ? decodeHtmlEntities(listing.description) : null;
  if (description) {
    facts.tagline = { value: description, confidence: "Medium", ambiguous: true, note: "Page's own RealEstateListing.description (JSON-LD) -- marketing prose, needs editorial review." };
    if (/bhk|bed residences|apartments/i.test(description)) {
      facts.category = { value: "Residential", confidence: "High", note: "Page's own listing description describes residential unit types." };
    }
    const possessionMatch = description.match(POSSESSION_PATTERN);
    if (possessionMatch) {
      const monthLabel = resolvePossessionMonthLabel(possessionMatch[1]);
      if (monthLabel) facts.possessionMonth = { value: monthLabel, confidence: "Medium", note: `Page's own listing description: "Possession ${possessionMatch[1]} ${possessionMatch[2]}".` };
      facts.possessionYear = { value: possessionMatch[2], confidence: "Medium", note: `Page's own listing description: "Possession ${possessionMatch[1]} ${possessionMatch[2]}".` };
    }
  }

  const place = blocks.find((b) => b["@type"] === "Place" || b["@type"] === "ApartmentComplex");
  const address = place?.address as { streetAddress?: string; addressLocality?: string } | undefined;
  const localityRaw = address?.streetAddress || address?.addressLocality;
  const localityFact = fact(localityRaw, "High", { note: "Page's own Place/ApartmentComplex address (JSON-LD)." });
  if (localityFact) facts.locality = localityFact;

  const reraMatch = html.match(RERA_PATTERN);
  if (reraMatch) {
    facts.reraNumber = { value: reraMatch[1].trim(), confidence: "High", note: "Page's own MahaRERA registration-number disclosure text (found in its FAQPage JSON-LD answer text)." };
  }

  // Deliberately NOT populated -- confirmed genuinely absent from the real
  // page inspected during Phase 47 (no field/section exists, not a parsing
  // failure): developerGroup, builder, priceMin (this page is
  // "pre-register for offers", no public price shown),
  // reraCertificateUrl, googleMapsUrl, launchDate,
  // actualPossession, constructionPercent, landAreaAcres, totalUnits,
  // totalTowers, amenities (no discrete named list on this page), status,
  // paymentPlanType/Description, specifications, faqs, videoUrl, tour360Url,
  // brochure, documents, images, metaTitle/metaDescription/ogImageUrl (this
  // adapter deliberately uses the structured breadcrumb name over the
  // marketing <title> tag, so no separate metaTitle fact is produced).

  return facts;
}

/** Real, live OfficialSourceAdapter for Kolte Patil Developers (Phase 47). Same contract as every other adapter here. */
export const koltePatilAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, { headers: { "User-Agent": FETCH_USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Kolte Patil page fetch failed with status ${response.status}`);
    }
    const html = await response.text();
    return extractKoltePatilFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Kolte Patil (Phase 47), hand-verified as a real Versova/Andheri West residential project on the developer's own site. */
export const KOLTE_PATIL_SERENOVA_PROJECT_URL = "https://www.koltepatil.com/mumbai/residential-properties/ongoing/serenova";
