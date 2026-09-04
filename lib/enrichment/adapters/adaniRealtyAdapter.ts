import { POSSESSION_MONTH_LABEL } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Verified live during Phase 31 against adanirealty.com's real markup. */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];

/** Verified live during Phase 31 -- two `<script type="application/ld+json">` blocks (Organization, Product). */
const LD_JSON_PATTERN = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

/** Verified live during Phase 31 -- adanirealty.com is a Sitecore JSS site; its `__NEXT_DATA__` payload nests real content under `props.pageProps.data.<ComponentName>.fields`, a materially different shape from Godrej's `props.pageProps.item`. A dedicated adapter is used rather than forcing a shared shape (Phase 31 Part G). */
const NEXT_DATA_PATTERN = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;

function extractTitle(html: string): string | null {
  const match = html.match(TITLE_PATTERN);
  return match ? match[1].trim() : null;
}

function extractMetaDescription(html: string): string | null {
  for (const pattern of META_DESCRIPTION_PATTERNS) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

/** This page's inline JSON-LD is rendered HTML-entity-escaped (`&quot;` for `"`) -- a real, page-specific quirk not present on Godrej's page. Decoded before parsing; tolerates a malformed block by skipping it (Part I). */
function decodeHtmlEntities(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function extractLdJsonBlocks(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const pattern = new RegExp(LD_JSON_PATTERN.source, LD_JSON_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(match[1]));
      if (parsed && typeof parsed === "object") blocks.push(parsed as Record<string, unknown>);
    } catch {
      // Malformed/undecodable JSON-LD block -- skip it, keep looking at the rest.
    }
  }
  return blocks;
}

/** Returns the real embedded Sitecore JSS data object (`props.pageProps.data`), or null if the page's markup shape ever changes -- never throws. */
function extractNextDataComponents(html: string): Record<string, unknown> | null {
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { props?: { pageProps?: { data?: unknown } } };
    const data = parsed?.props?.pageProps?.data;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Every Sitecore JSS component in this payload has the same `{ fields: {...} }` envelope. */
function componentFields(components: Record<string, unknown>, componentName: string): Record<string, unknown> | null {
  const component = components[componentName] as { fields?: unknown } | undefined;
  const fields = component?.fields;
  return fields && typeof fields === "object" ? (fields as Record<string, unknown>) : null;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Parses this page's real possession format, `"Possession: 31/10/2028"` (DD/MM/YYYY) -- confirmed against the actual string, not assumed from a generic date parser (which would misread day/month order). */
function parsePossessionDdMmYyyy(text: string): { month: string; year: string } | null {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const month = Number(match[2]);
  const year = match[3];
  if (month < 1 || month > 12) return null;
  return { month: POSSESSION_MONTH_LABEL[month], year };
}

/** Parses `"2.5 Acres"` (and tolerates `"2.5 Acres | 1.01 Hectares"`) into the registry's own `"${n} acres"` display convention. */
function parseAcres(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*acres?/i);
  return match ? `${match[1]} acres` : null;
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Adani Realty project page (Phase 31). Every path here was confirmed
 * against the actual live markup for linkbay-residences: `<title>`/meta
 * description, two JSON-LD blocks (Organization, Product -- HTML-entity
 * escaped), and a Sitecore JSS `__NEXT_DATA__` payload exposing real content
 * as named components (`ProjectName`, `PropertyBasicInfo`, `seoData`,
 * `ProjectHighlights`, `PropertyAmenitesInfo`, `PropertyHighligtsInfo`, `Faq`,
 * `GalleryHighlights`, `GalleryModalData`, `breadCrumbList`).
 *
 * Several real, live traps were found and deliberately NOT extracted (Part F):
 *  - `PropertyBasicInfo.fields.possession` contains the marketing blurb, not a
 *    date -- a genuine CMS content-mapping bug. Real possession comes from
 *    `ProjectHighlights.fields.projectHighlights.galleryIconsData`'s
 *    `"Possession: 31/10/2028"` string instead.
 *  - `PropertyBasicInfo.fields.brochure` contains an address string, not a
 *    URL -- left unmapped; `brochure` correctly reports MISSING.
 *  - `ConfigurationData` is unrelated placeholder/demo content (a Delhi golf
 *    club list) left over in the CMS -- never read.
 *  - The "tour360" gallery entry is a single static image, not an actual
 *    interactive tour -- `tour360Url` correctly reports MISSING rather than
 *    treating a mislabeled image as a real 360 tour.
 *  - No price is published on this page at all (its own FAQ says prices are
 *    "available on request") -- priceMin correctly reports MISSING, not
 *    inferred from anything.
 *
 * As tolerant of missing/malformed sections as the Godrej adapter (Part I):
 * every field extraction is independent.
 */
export function extractAdaniLinkbayFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};

  // This page's raw <title>/meta description contain literal HTML entities
  // (e.g. "Price &amp; Plans") -- decoded so the proposed value reads the way
  // a visitor would actually see it, not as raw markup.
  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: decodeHtmlEntities(title), confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: decodeHtmlEntities(description), confidence: "High" };

  try {
    const organization = extractLdJsonBlocks(html).find((b) => b["@type"] === "Organization") as { name?: unknown } | undefined;
    const developerFact = fact(organization?.name, "High", {
      note: "Official site's own Organization structured data (JSON-LD name) -- does not mention any joint-venture partner.",
    });
    if (developerFact) facts.developerGroup = developerFact;
  } catch {
    /* ignore */
  }

  const components = extractNextDataComponents(html);
  if (!components) return facts;

  try {
    // Real shape: fields.projectName.{title,location} -- one level deeper
    // than most other components (verified against the live page).
    const projectName = componentFields(components, "ProjectName")?.projectName as Record<string, unknown> | undefined;
    const nameFact = fact(projectName?.title, "High", { note: "Sitecore JSS ProjectName component, fields.projectName.title." });
    if (nameFact) facts.name = nameFact;
    const addressFact = fact(projectName?.location, "High", {
      note: "ProjectName component's own location string -- cross-confirmed by the page's JSON-LD Organization.address.streetAddress.",
    });
    if (addressFact) facts.address = addressFact;
  } catch {
    /* ignore */
  }

  try {
    const breadcrumb = components.breadCrumbList as { fields?: unknown } | undefined;
    const items = Array.isArray(breadcrumb?.fields) ? (breadcrumb!.fields as Record<string, unknown>[]) : [];
    const hasResidential = items.some((i) => typeof i.label === "string" && /residential/i.test(i.label));
    if (hasResidential) facts.category = { value: "Residential", confidence: "High", note: "Page's own breadcrumb path (Residential Projects)." };
  } catch {
    /* ignore */
  }

  try {
    const basicInfo = componentFields(components, "PropertyBasicInfo");
    const statusFact = fact(basicInfo?.status, "High");
    if (statusFact) facts.status = statusFact;

    if (typeof basicInfo?.projectArea === "string") {
      const acres = parseAcres(basicInfo.projectArea);
      if (acres) {
        facts.landAreaAcres = {
          value: acres,
          confidence: "High",
          note: "PropertyBasicInfo.projectArea, cross-confirmed by the page's own FAQ answer and its ProjectHighlights gallery icon data.",
        };
      }
    }

    // `basicInfo.brochure` is a real key but on this page holds an address
    // string, not a URL -- a genuine CMS mismapping. Deliberately not read.
    // `basicInfo.possession` similarly holds marketing prose, not a date --
    // deliberately not read; the real possession date comes from
    // ProjectHighlights below instead.
  } catch {
    /* ignore */
  }

  try {
    const highlightsData = componentFields(components, "ProjectHighlights")?.projectHighlights as
      | { galleryIconsData?: unknown; reraData?: unknown }
      | undefined;
    const icons = Array.isArray(highlightsData?.galleryIconsData) ? (highlightsData!.galleryIconsData as Record<string, unknown>[]) : [];

    const possessionIcon = icons.find((i) => typeof i.type === "string" && /possession:/i.test(i.type));
    if (possessionIcon && typeof possessionIcon.type === "string") {
      const parsed = parsePossessionDdMmYyyy(possessionIcon.type);
      if (parsed) {
        facts.possessionMonth = { value: parsed.month, confidence: "High" };
        facts.possessionYear = { value: parsed.year, confidence: "High" };
      }
    }

    const reraEntries = Array.isArray(highlightsData?.reraData) ? (highlightsData!.reraData as Record<string, unknown>[]) : [];
    const rera = reraEntries[0];
    const reraNumberFact = fact(rera?.reraNumber, "High", { note: "ProjectHighlights.reraData -- a real MahaRERA registration number, not an LOI reference." });
    if (reraNumberFact) facts.reraNumber = reraNumberFact;

    const reraModal = Array.isArray(rera?.reraModal) ? (rera!.reraModal as Record<string, unknown>[])[0] : undefined;
    const certFact = fact(reraModal?.downloadLink, "High", { note: "Direct certificate file link embedded in the page's own RERA modal data." });
    if (certFact) facts.reraCertificateUrl = certFact;
  } catch {
    /* ignore */
  }

  try {
    // PropertyHighligtsInfo is itself an array-shaped component (no `.fields.x` object -- its `fields` IS the array).
    const rawFields = (components.PropertyHighligtsInfo as { fields?: unknown } | undefined)?.fields;
    const shortLabels = Array.isArray(rawFields)
      ? (rawFields as Record<string, unknown>[]).map((f) => f.type).filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];

    const aboutHtml = componentFields(components, "PropertyAbout")?.description;
    const buildingHighlights =
      typeof aboutHtml === "string" ? [...aboutHtml.matchAll(/<strong>([^<]+)<\/strong>/gi)].map((m) => m[1].trim()) : [];

    const parts = [
      shortLabels.length ? `Project highlights: ${shortLabels.join(", ")}` : null,
      buildingHighlights.length ? `Building highlights: ${buildingHighlights.join(", ")}` : null,
    ].filter((p): p is string => Boolean(p));

    if (parts.length) {
      facts.highlights = {
        value: parts.join(". "),
        confidence: "Medium",
        ambiguous: true,
        note: "Combines the page's short PropertyHighligtsInfo labels and the bolded lead-ins from its PropertyAbout copy -- real content, needs curation.",
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const amenities = componentFields(components, "PropertyAmenitesInfo")?.projectAmeneties as { data?: unknown } | undefined;
    const list = Array.isArray(amenities?.data) ? (amenities!.data as Record<string, unknown>[]) : [];
    const names = list.map((a) => a.caption).filter((n): n is string => typeof n === "string" && n.length > 0);
    if (names.length) {
      facts.amenities = {
        value: `${names.length} selected`,
        confidence: "High",
        ambiguous: true,
        note: `Named list: ${names.join(", ")}.`,
        items: names,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const faqComponent = componentFields(components, "Faq")?.faqData as { faqs?: unknown } | undefined;
    const faqs = Array.isArray(faqComponent?.faqs) ? (faqComponent!.faqs as Record<string, unknown>[]) : [];
    const questions = faqs.map((f) => f.title).filter((t): t is string => typeof t === "string" && t.length > 0);
    if (questions.length) {
      facts.faqs = { value: `${questions.length} listed`, confidence: "High", note: `Questions: ${questions.join(" | ")}`, items: questions };
    }
  } catch {
    /* ignore */
  }

  try {
    const seo = componentFields(components, "seoData");
    const ogImageFact = fact(seo?.ogImage, "High");
    if (ogImageFact) facts.ogImageUrl = ogImageFact;
  } catch {
    /* ignore */
  }

  try {
    const basicInfo = componentFields(components, "PropertyBasicInfo");
    const coverFact = fact(basicInfo?.propertyImage, "High");
    if (coverFact) facts.coverImage = coverFact;
  } catch {
    /* ignore */
  }

  try {
    const gallery = componentFields(components, "GalleryHighlights")?.galleryHighlights;
    const entries = Array.isArray(gallery) ? (gallery as Record<string, unknown>[]) : [];
    const urls = entries.map((e) => e.src).filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length) {
      facts.images = { value: `${urls.length} image(s)`, confidence: "High", note: "Gallery image URLs found on the official page.", items: urls };
    }
  } catch {
    /* ignore */
  }

  try {
    const modal = componentFields(components, "GalleryModalData")?.galleryModalData as
      | { videoCarouselData?: { modalSlidesData?: { gallerydata?: unknown } } }
      | undefined;
    const items = Array.isArray(modal?.videoCarouselData?.modalSlidesData?.gallerydata)
      ? (modal!.videoCarouselData!.modalSlidesData!.gallerydata as Record<string, unknown>[])
      : [];
    const withVideo = items.find((i) => typeof i.videomp4 === "string" && (i.videomp4 as string).trim());
    const videoFact = fact(withVideo?.videomp4, "High");
    if (videoFact) facts.videoUrl = videoFact;
  } catch {
    /* ignore */
  }

  // Deliberately NOT populated -- confirmed genuinely absent, mismapped, or
  // not a real interactive asset on this page (Phase 31 inspection), not a
  // parsing failure: priceMin (page states prices are "available on
  // request"), locality (no discrete neighbourhood-name field distinct from
  // the address string -- extracting one from prose would be exactly the
  // kind of inference Part F forbids), microMarket, googleMapsUrl, tagline,
  // description, specifications, totalUnits, totalTowers, launchDate,
  // actualPossession, constructionPercent, paymentPlanType,
  // paymentPlanDescription, tour360Url, brochure, documents, builder.

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Adani Realty (Phase 31 -- second-
 * developer generalization proof). Same contract as godrejPropertiesAdapter:
 * a genuine `fetch()`, no fixture data, throws on fetch failure so the caller
 * can distinguish "source unavailable" from "found nothing."
 */
export const adaniRealtyAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Adani Realty page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractAdaniLinkbayFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Adani Realty (Phase 31). */
export const ADANI_LINKBAY_RESIDENCES_PROJECT_URL = "https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences";
