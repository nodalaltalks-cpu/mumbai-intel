import { formatPaise } from "@/lib/format";
import { POSSESSION_MONTH_LABEL } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Verified live against the real page during Phase 29 (`<title data-next-head="">...`). */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;

/** Verified live against the real page during Phase 29 -- matches either attribute order. */
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];

/** Verified live during Phase 30 -- six `<script type="application/ld+json" ...>` blocks on the real page. */
const LD_JSON_PATTERN = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

/** Verified live during Phase 30 -- the real page embeds a Next.js `__NEXT_DATA__` script with the full project payload at `props.pageProps.item`. */
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

/** Tolerates a malformed/missing block entirely -- one bad JSON-LD script must never fail the whole extraction (Part I). */
function extractLdJsonBlocks(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const pattern = new RegExp(LD_JSON_PATTERN.source, LD_JSON_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object") blocks.push(parsed as Record<string, unknown>);
    } catch {
      // Malformed JSON-LD block -- skip it, keep looking at the rest.
    }
  }
  return blocks;
}

/** Returns the real embedded project-data object (`props.pageProps.item`), or null if the page's markup shape ever changes -- never throws. */
function extractNextDataItem(html: string): Record<string, unknown> | null {
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as { props?: { pageProps?: { item?: unknown } } };
    const item = parsed?.props?.pageProps?.item;
    return item && typeof item === "object" ? (item as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The CMS's rich-text shape: `{ document: [{ type: "paragraph", children: [{ text: "..." }] }] }`. Flattens to plain text, or null if the shape is empty/unrecognized. */
function plainTextFromRichText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const document = (value as { document?: unknown }).document;
  if (!Array.isArray(document)) return null;
  const text = document
    .map((block) => {
      const children = (block as { children?: unknown })?.children;
      if (!Array.isArray(children)) return "";
      return children.map((c) => (typeof (c as { text?: unknown })?.text === "string" ? (c as { text: string }).text : "")).join("");
    })
    .join("\n")
    .trim();
  return text || null;
}

function fact(value: unknown, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Godrej Properties project page (Phase 30). Every path here was confirmed
 * against the actual live markup for godrej-skyshore during this phase --
 * `<title>`/meta description (Phase 29), six JSON-LD blocks, and a Next.js
 * `__NEXT_DATA__` script exposing the full CMS project object at
 * `props.pageProps.item` (Phase 30). Nothing here is guessed: a field is
 * populated only when a real, structured value was found; everything else is
 * left absent so classifyProjectEnrichment() correctly reports it MISSING
 * rather than fabricated.
 *
 * Deliberately tolerant per Part I: every field extraction is independent --
 * a missing section, a null value, or a shape change in one field can never
 * prevent any other field from being extracted. No fixture data is read or
 * merged in here (Phase 30 Part G) -- whatever isn't found on the real page
 * is correctly reported MISSING by the classifier, not silently backfilled.
 */
export function extractGodrejSkyShoreFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};

  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: title, confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: description, confidence: "High" };

  try {
    const organization = extractLdJsonBlocks(html).find((b) => b["@type"] === "Organization") as { legalName?: unknown } | undefined;
    const legalName = fact(organization?.legalName, "High", {
      note: "Official site's own Organization structured data (JSON-LD legalName) -- an exact corporate-form difference from the staged value is a real finding, not noise.",
    });
    if (legalName) facts.developerGroup = legalName;
  } catch {
    // JSON-LD block missing/malformed -- no developerGroup fact this run, everything else still proceeds.
  }

  const item = extractNextDataItem(html);
  if (!item) return facts; // Regex/JSON-LD facts above still stand even if the embedded data block is gone.

  try {
    const nameFact = fact(item.name, "High", { note: "Embedded page data (__NEXT_DATA__), item.name." });
    if (nameFact) facts.name = nameFact;
  } catch {
    /* ignore */
  }

  try {
    const categoryFact = fact(item.residentialType, "High");
    if (categoryFact) facts.category = categoryFact;
  } catch {
    /* ignore */
  }

  try {
    const statusFact = fact(item.key_usp, "High", { note: "The page's own project-status label (key_usp)." });
    if (statusFact) facts.status = statusFact;
  } catch {
    /* ignore */
  }

  try {
    if (typeof item.location === "string" && item.location.trim()) {
      const loc = item.location.trim();
      facts.locality = {
        value: loc,
        confidence: "High",
        note: "Official page's own location string -- a mismatch here may reflect formatting/granularity rather than a real disagreement with the administrative locality name.",
      };
      facts.microMarket = {
        value: loc,
        confidence: "High",
        note: "Same official location string, offered here as the street-level micro-market descriptor.",
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const neighbourhood = item.neighbourhood as Record<string, unknown> | undefined;
    const addressFact = fact(neighbourhood?.address, "Medium", {
      ambiguous: true,
      note: 'Labeled "Sales Lounge" on the source page -- may be the sales office address rather than the registered project address.',
    });
    if (addressFact) facts.address = addressFact;

    const mapsFact = fact(neighbourhood?.google_map_api, "High");
    if (mapsFact) facts.googleMapsUrl = mapsFact;

    const coords = neighbourhood?.geolocation_coordinates as Record<string, unknown> | undefined;
    const latFact = fact(coords?.latitude, "High");
    if (latFact) facts.latitude = latFact;
    const lngFact = fact(coords?.longitude, "High");
    if (lngFact) facts.longitude = lngFact;

    const nearbyPlaces = Array.isArray(neighbourhood?.nearByPlaces) ? (neighbourhood!.nearByPlaces as Record<string, unknown>[]) : [];
    const nearbyNames = nearbyPlaces.map((p) => p?.name).filter((n): n is string => typeof n === "string" && n.length > 0);
    const amenityBodyText = plainTextFromRichText(item.amenity_body);
    const highlightParts = [nearbyNames.length ? `Distance highlights: ${nearbyNames.join(", ")}` : null, amenityBodyText].filter(
      (p): p is string => Boolean(p)
    );
    if (highlightParts.length) {
      facts.highlights = {
        value: highlightParts.join(" — "),
        confidence: "Medium",
        ambiguous: true,
        note: 'Combines the page\'s named distance highlights and its "Project Highlights" prose block -- real content, needs curation into discrete bullet points.',
      };
    }
  } catch {
    /* ignore -- neighbourhood block missing/malformed shouldn't block anything else */
  }

  try {
    const configs = Array.isArray(item.starting_prices) ? (item.starting_prices as Record<string, unknown>[]) : [];
    const mins = configs.map((c) => c.minimum_price).filter((n): n is number => typeof n === "number");
    const maxes = configs.map((c) => c.maximum_price).filter((n): n is number => typeof n === "number");
    if (mins.length) {
      facts.priceMin = {
        value: formatPaise(Math.min(...mins) * 100),
        confidence: "High",
        note: "Lowest configuration's minimum_price across item.starting_prices.",
      };
    }
    if (maxes.length) {
      facts.priceMax = {
        value: formatPaise(Math.max(...maxes) * 100),
        confidence: "High",
        note: "Highest configuration's maximum_price across item.starting_prices -- a real structured price point, not marketing copy.",
      };
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof item.possessionDate === "string") {
      const d = new Date(item.possessionDate);
      if (!Number.isNaN(d.getTime())) {
        facts.possessionMonth = { value: POSSESSION_MONTH_LABEL[d.getUTCMonth() + 1], confidence: "High" };
        facts.possessionYear = { value: String(d.getUTCFullYear()), confidence: "High" };
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const overviewText = plainTextFromRichText(item.overview);
    if (overviewText) {
      facts.tagline = {
        value: overviewText,
        confidence: "Medium",
        ambiguous: true,
        note: 'Marketing prose from the page\'s own "overview" block -- needs editorial shortening/approval, not a verbatim fact.',
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const amenities = Array.isArray(item.amenities) ? (item.amenities as Record<string, unknown>[]) : [];
    const names = amenities.map((a) => a?.title).filter((n): n is string => typeof n === "string" && n.length > 0);
    if (names.length) {
      facts.amenities = {
        value: `${names.length} selected`,
        confidence: "High",
        ambiguous: true,
        note: `Named list: ${names.join(", ")}. Real, structured content -- still routed to human confirmation before publishing, per this project's prior review determination.`,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const thumbnail = item.thumbnail as Record<string, unknown> | undefined;
    const coverFact = fact(thumbnail?.url, "High");
    if (coverFact) facts.coverImage = coverFact;
  } catch {
    /* ignore */
  }

  try {
    const images = Array.isArray(item.gallery_image_uploads) ? (item.gallery_image_uploads as Record<string, unknown>[]) : [];
    const urls = images
      .map((i) => (i?.img_upload as Record<string, unknown> | undefined)?.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length) {
      facts.images = { value: `${urls.length} image(s)`, confidence: "High", note: "Gallery image URLs found on the official page." };
    }
  } catch {
    /* ignore */
  }

  try {
    const videos = Array.isArray(item.gallery_video_uploads) ? (item.gallery_video_uploads as Record<string, unknown>[]) : [];
    const withUrl = videos.filter((v) => typeof v?.video_upload === "string" && (v.video_upload as string).trim());
    if (withUrl.length) {
      facts.videoUrl = {
        value: (withUrl[0].video_upload as string).trim(),
        confidence: "High",
        note: withUrl.length > 1 ? `${withUrl.length} videos found on the page; showing the first.` : undefined,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const brochure = item.brochure as Record<string, unknown> | undefined;
    const brochureFact = fact(brochure?.url, "High", {
      note: "Publicly embedded in the page's own data -- no lead form or login required to obtain this URL.",
    });
    if (brochureFact) facts.brochure = brochureFact;
  } catch {
    /* ignore */
  }

  try {
    const docs = Array.isArray(item.compliance) ? (item.compliance as Record<string, unknown>[]) : [];
    const titles = docs.map((d) => d?.title).filter((t): t is string => typeof t === "string" && t.length > 0);
    if (titles.length) {
      facts.documents = { value: `${titles.length} document(s)`, confidence: "High", note: `Compliance filing(s): ${titles.join(", ")}.` };
    }
  } catch {
    /* ignore */
  }

  try {
    const reraStatusFact = fact(item.rera_details, "Medium", {
      ambiguous: true,
      note: "The official page cites a Letter of Intent (LOI) reference, not an explicit RERA registration number or status label -- needs human confirmation before treating as the project's RERA status.",
    });
    if (reraStatusFact) facts.reraStatus = reraStatusFact;
  } catch {
    /* ignore */
  }

  // Deliberately NOT populated -- confirmed genuinely absent from this page
  // during Phase 30's inspection (no field/section exists for them, not a
  // parsing failure): reraNumber, reraCertificateUrl, paymentPlanType,
  // paymentPlanDescription, launchDate, actualPossession, constructionPercent,
  // landAreaAcres, totalUnits, totalTowers, specifications, faqs, tour360Url,
  // ogImageUrl, builder. classifyProjectEnrichment() correctly reports these
  // MISSING rather than this adapter guessing or borrowing a fixture value.

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Godrej Properties (Phase 29 Part G/H,
 * expanded to maximum real extraction in Phase 30).
 *
 * Performs a genuine `fetch()` of the project page and extracts every field
 * `extractGodrejSkyShoreFacts()` can support from the real markup -- no
 * fixture data is read or merged into the production path (Phase 30 Part G).
 * If the fetch itself fails (network error, non-OK status), this throws --
 * the caller (lib/actions/enrichment.ts) turns that into the "official
 * source temporarily unavailable" UI state rather than this module silently
 * returning empty facts.
 */
export const godrejPropertiesAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Godrej Properties page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractGodrejSkyShoreFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich (Phase 29 Part G). */
export const GODREJ_SKY_SHORE_PROJECT_URL = "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore";
