import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Verified live during Phase 42 against lodhagroup.com's real markup for the
 * lodha-cullinan project page. A SIXTH distinct page shape now proven: a
 * Drupal 10 site (confirmed via `<meta name="Generator" content="Drupal
 * 10">` and its own `currentPath: "node/1669"` settings blob) -- completely
 * different from every Next.js/Strapi/Sitecore/plain-HTML shape the other
 * five adapters handle. No `__NEXT_DATA__` exists; the one genuinely
 * structured signal is a real `application/ld+json` FAQPage block. That
 * block's raw text contains a literal (unescaped) newline character inside
 * one answer string -- invalid per the JSON spec, and `JSON.parse` throws on
 * it unless collapsed first, a real page-specific quirk (not a hypothetical
 * one) discovered by trying to parse the actual page.
 */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];
const FAQ_LD_JSON_PATTERN = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i;

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

/** This page's own FAQPage JSON-LD has at least one literal newline embedded inside a quoted string value -- invalid JSON syntax. Collapsing all literal line breaks to a space (before parsing, not after) is the minimal fix; tolerates a still-malformed block by returning null rather than throwing. */
function extractFaqLdJson(html: string): { name: string; answer: string }[] | null {
  const match = html.match(FAQ_LD_JSON_PATTERN);
  if (!match) return null;
  try {
    const collapsed = match[1].replace(/[\r\n]+/g, " ");
    const parsed = JSON.parse(collapsed) as { "@type"?: string; mainEntity?: unknown };
    if (parsed["@type"] !== "FAQPage" || !Array.isArray(parsed.mainEntity)) return null;
    return (parsed.mainEntity as Record<string, unknown>[])
      .map((q) => ({
        name: typeof q.name === "string" ? q.name.trim() : "",
        answer: typeof (q.acceptedAnswer as Record<string, unknown> | undefined)?.text === "string" ? ((q.acceptedAnswer as Record<string, unknown>).text as string).trim() : "",
      }))
      .filter((q) => q.name && q.answer);
  } catch {
    return null;
  }
}

function fact(value: string | null | undefined, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (!value || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Parses this page's real RERA widget text, `"MahaRERA registration numbers:&nbsp;<br>P51800054551<br>..."`. */
function parseReraNumber(html: string): string | null {
  const match = html.match(/MahaRERA registration numbers?:?(?:&nbsp;|\s)*(?:<br\s*\/?>\s*)?([A-Z]\d{8,})/i);
  return match ? match[1].toUpperCase() : null;
}

function extractOgUrl(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"));
  return match ? match[1] : null;
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Lodha project page (Phase 42 -- sixth developer). Every path here was
 * confirmed against the actual live markup for lodha-cullinan: `<title>`/
 * meta description, a real FAQPage JSON-LD block (4 genuine Q&A pairs), a
 * "Click here for RERA details" slide-out widget with a real MahaRERA
 * registration number, and a real banner photo.
 *
 * Real, deliberate non-extractions (this page's own genuine gaps, not
 * parsing failures):
 *  - No price is published anywhere on this page (confirmed by scanning the
 *    raw HTML for ₹/Cr/Lakh text -- none found).
 *  - No possession date, launch date, or construction-progress text exists.
 *  - No Organization JSON-LD exists on this project page (developer identity
 *    lives on the site's homepage, a different page) -- developerGroup
 *    correctly reports MISSING.
 *  - No `og:image`/`og:description` meta tags exist on this page.
 *  - No coordinates or embedded Google Maps link exist on this page.
 */
export function extractLodhaCullinanFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};
  const origin = "https://www.lodhagroup.com";

  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: title, confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: description, confidence: "High" };

  // The page's own <title> is "<Project Name> - <rest>" -- the project name
  // is always the segment before the first " - ".
  const nameFromTitle = title?.split(" - ")[0]?.trim();
  const nameFactValue = fact(nameFromTitle, "High", { note: "Parsed from the page's own <title> tag (segment before the first ' - ')." });
  if (nameFactValue) facts.name = nameFactValue;

  if (/\bBHK\b/i.test(description ?? "") || /\bBHK\b/i.test(title ?? "")) {
    facts.category = { value: "Residential", confidence: "High", note: "Page's own title/meta description both describe BHK residential flats." };
  }

  const reraNumber = parseReraNumber(html);
  if (reraNumber) {
    facts.reraNumber = { value: reraNumber, confidence: "High", note: 'Page\'s own "Click here for RERA details" slide-out widget.' };
  }

  const faqs = extractFaqLdJson(html);
  if (faqs && faqs.length) {
    facts.faqs = {
      value: `${faqs.length} listed`,
      confidence: "High",
      note: `Page's own real FAQPage structured data: ${faqs.map((q) => q.name).join(" | ")}`,
      items: faqs.map((q) => q.name),
    };

    const locationAnswer = faqs.find((q) => /where is/i.test(q.name))?.answer;
    if (locationAnswer) {
      const locationMatch = locationAnswer.match(/located\s+([^.]+?)(?:\s*-\s*|\.|$)/i);
      const localityValue = locationMatch ? locationMatch[1].trim() : null;
      const localityFact = fact(localityValue, "Medium", {
        ambiguous: true,
        note: `Extracted from the page's own FAQ answer to "${faqs.find((q) => /where is/i.test(q.name))?.name}" -- real content, but prose-derived rather than a discrete structured field.`,
      });
      if (localityFact) {
        facts.locality = localityFact;
        facts.microMarket = { ...localityFact };
      }
    }

    const amenitiesAnswer = faqs.find((q) => /amenities/i.test(q.name))?.answer;
    if (amenitiesAnswer) {
      const listMatch = amenitiesAnswer.match(/amenities such as\s+(.+?)\.?$/i);
      const names = listMatch
        ? listMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      if (names.length) {
        facts.amenities = {
          value: `${names.length} selected`,
          confidence: "Medium",
          ambiguous: true,
          note: `Extracted from the page's own FAQ answer about amenities: ${names.join(", ")}. Real content, but prose-derived rather than a discrete structured list.`,
          items: names,
        };
      }
    }
  }

  const bannerMatch = html.match(/["'](\/sites\/default\/files\/projects\/banner\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
  const coverFact = fact(bannerMatch?.[1] ? `${origin}${bannerMatch[1]}` : undefined, "High", { note: "Page's own project banner image." });
  if (coverFact) facts.coverImage = coverFact;

  const ogImage = extractOgUrl(html, "og:image");
  const ogImageFact = fact(ogImage, "High");
  if (ogImageFact) facts.ogImageUrl = ogImageFact;

  // Deliberately NOT populated -- confirmed genuinely absent from this page
  // during Phase 42's inspection (no field/section exists for them, not a
  // parsing failure): developerGroup, builder, address, priceMin,
  // possessionMonth, possessionYear, launchDate, actualPossession,
  // constructionPercent, landAreaAcres, totalUnits, totalTowers,
  // paymentPlanType, paymentPlanDescription, highlights, specifications,
  // videoUrl, tour360Url, brochure, documents, reraCertificateUrl,
  // googleMapsUrl, images.

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Lodha (Phase 42 -- sixth developer).
 * Same contract as every other adapter here: a genuine `fetch()`, no fixture
 * data, throws on fetch failure so the caller can distinguish "source
 * unavailable" from "found nothing."
 */
export const lodhaAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Lodha page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractLodhaCullinanFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Lodha (Phase 42). */
export const LODHA_CULLINAN_PROJECT_URL = "https://www.lodhagroup.com/projects/residential-property-in-andheri/lodha-cullinan";
