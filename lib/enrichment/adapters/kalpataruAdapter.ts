import { formatPaise } from "@/lib/format";
import { CATEGORY_LABEL, CONSTRUCTION_BADGE_LABEL, POSSESSION_MONTH_LABEL, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { EnrichmentConfidence, OfficialSourceAdapter, RawSourceFact, SourceFactsMap } from "../types";
import { resolveDeveloperDomain } from "../developerDomainRegistry";

const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Verified live during Phase 38 against kalpataru.com's real markup for
 * kalpataru-vian. This site is a different CMS from Godrej (Next.js
 * `__NEXT_DATA__`) and Adani (Sitecore JSS) -- it is a classically
 * server-rendered page with no `__NEXT_DATA__`, no `__NUXT__`, and no
 * `application/json` script payload of any kind. The only genuinely
 * structured signal is three `application/ld+json` blocks (Organization,
 * RealEstateAgent, an ItemList of VideoObjects) -- none of them carry
 * project-specific facts like price/possession/RERA. Every project fact
 * instead comes from the page's own clearly-labeled visible HTML (a
 * `"Status: X" / "Location: X" / "Price: X" / "Possession: X"` block, an
 * explicit RERA disclaimer paragraph, a labeled amenities/key-benefits
 * section, and a labeled downloads list) -- Part C priority tier 4
 * ("visible content, only when reliably identifiable"), not tier 1/2. This is
 * the third distinct page shape now proven (Phase 38 Part E/H), which is
 * exactly what this phase set out to determine.
 */
const TITLE_PATTERN = /<title[^>]*>([^<]+)<\/title>/i;
const META_DESCRIPTION_PATTERNS = [
  /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
];
const OG_IMAGE_PATTERN = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i;
const LD_JSON_PATTERN = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

/** This page's <title>/meta description contain literal HTML entities (e.g. "&amp;") -- same real-page quirk documented in adaniRealtyAdapter.ts. */
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

function fact(value: string | null | undefined, confidence: EnrichmentConfidence, opts: { ambiguous?: boolean; note?: string } = {}): RawSourceFact | undefined {
  if (!value || !value.trim()) return undefined;
  return { value: value.trim(), confidence, ...opts };
}

/** Extracts one `>&nbsp;Label:&nbsp;value</div>` line from the page's own labeled project-summary block (`Status:`, `Location:`, `Price:`, `Possession:`, `Typology:`). Real, explicit HTML metadata -- not inferred from prose. */
function extractLabeledLine(html: string, label: string): string | null {
  const pattern = new RegExp(`>\\s*${label}:\\s*([^<]+)<\\/div>`, "i");
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Reverses this codebase's own `CONSTRUCTION_BADGE_LABEL` map, but ONLY where
 * exactly one `ProjectStatus` produces that label -- several labels
 * ("Under Construction", "Ready to Move") are deliberately many-to-one and
 * must never be guessed at. Kalpataru's own page literally labels this
 * project "New Launch", which `CONSTRUCTION_BADGE_LABEL.PRE_LAUNCH` alone
 * produces -- a real, unambiguous, already-existing mapping in this codebase,
 * not a new invented one.
 */
function unambiguousStatusFromBadgeLabel(label: string): ProjectStatus | null {
  const matches = (Object.keys(CONSTRUCTION_BADGE_LABEL) as ProjectStatus[]).filter(
    (status) => CONSTRUCTION_BADGE_LABEL[status].toLowerCase() === label.trim().toLowerCase()
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Parses this page's real price format, `"Starts from ₹ 5.61Cr+* onwards"`, into the registry's own formatPaise() display convention. Deliberately returns ONLY a minimum -- Part H explicitly forbids turning a "starting from" figure into a fabricated price range. */
function parseStartingPriceToMinRupees(text: string): number | null {
  const cr = text.match(/([\d.]+)\s*Cr/i);
  if (cr) return Math.round(parseFloat(cr[1]) * 1e7);
  const lakh = text.match(/([\d.]+)\s*L\b/i);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 1e5);
  return null;
}

/** Parses this page's real possession format, `"June 2032"` -- a plain month name, not a numeric date. */
function parsePossessionMonthYear(text: string): { month: string; year: string } | null {
  const match = text.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const monthIndex = POSSESSION_MONTH_LABEL.findIndex((label) => label.toLowerCase() === match[1].toLowerCase());
  if (monthIndex < 1) return null;
  return { month: POSSESSION_MONTH_LABEL[monthIndex], year: match[2] };
}

/** `"Approx. 4 acres of meticulously planned private enclave"` -> `"4 acres"`, matching the registry's own `"${n} acres"` display convention. The leading "Approx." is real and preserved as a note, not silently dropped. */
function parseApproxAcres(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*acres?/i);
  return match ? `${match[1]} acres` : null;
}

/** Strips HTML comments before scanning -- this page has one entire amenity category (`Terrace Level Amenities`, 10 items) commented out in the live markup; a naive `<li>` scan would silently invent 10 amenities the site itself doesn't currently show (Part H). */
function extractAmenities(html: string): string[] {
  const start = html.indexOf('<div id="amenities"');
  if (start === -1) return [];
  const end = html.indexOf("<!--Mobile slider-->", start);
  const block = end === -1 ? html.slice(start) : html.slice(start, end);
  const withoutComments = block.replace(/<!--[\s\S]*?-->/g, "");
  return [...withoutComments.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1].trim()).filter(Boolean);
}

function extractKeyBenefits(html: string): string[] {
  return [...html.matchAll(/overview-slider-text">\s*([^<]+?)\s*<\/div>/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** The page's one project-specific downloadable link found by its own visible label (`"Brochure"` / `"Opportunity Docket"`), scoped to a short lookahead window so this never matches an unrelated later download-item on the same page. */
function extractDownloadLink(html: string, label: string): string | null {
  const pattern = new RegExp(`${label}\\s*<\\/div>[\\s\\S]{0,300}?href="([^"]+)"`, "i");
  const match = html.match(pattern);
  return match ? match[1] : null;
}

/**
 * Extracts the maximum genuinely-supported set of Project facts from a real
 * Kalpataru project page (Phase 38 -- third-developer generalization proof).
 * Every path here was confirmed against the actual live markup for
 * kalpataru-vian: `<title>`/meta description/og:image, three JSON-LD blocks
 * (Organization, RealEstateAgent, ItemList<VideoObject>), a labeled
 * project-summary block (Status/Location/Price/Possession/Typology), an
 * explicit RERA disclaimer paragraph, a "Key Benefits" bullet slider, a
 * categorized amenities accordion, and a labeled downloads list
 * (Brochure, Opportunity Docket).
 *
 * Several real, deliberate non-extractions (Part H):
 *  - `priceMax` is never populated -- the page only ever states a "starting
 *    from" figure; inventing a ceiling from that would be exactly the
 *    forbidden conversion Part H names.
 *  - `latitude`/`longitude` are never populated -- unlike Godrej's page (which
 *    embeds raw coordinates in its CMS payload), this page only links a
 *    shortened Google Maps URL (`maps.app.goo.gl/...`). Resolving that
 *    shortlink would require an extra, non-deterministic network hop outside
 *    the page's own content -- left MISSING rather than guessed or fetched
 *    as a side effect.
 *  - `landAreaAcres` is YELLOW, not GREEN_NEW -- the page's own figure is
 *    prefixed "Approx." (an approximation, not a settled figure).
 *  - `reraCertificateUrl` is never populated -- the only RERA PDF link on the
 *    page is `kalpataru.com`'s own generic corporate-wide RERA filings link
 *    in the site footer nav, not a project-specific certificate. Treating a
 *    generic footer link as this project's own certificate would misattribute
 *    it.
 *  - `images` (a curated project photo gallery) is never populated -- this
 *    page has a labeled "Video Gallery" section but no equivalent labeled
 *    photo-gallery section; the individual banner/overview/key-benefit
 *    photos are section-specific decoration, not a curated gallery array.
 *  - `specifications`, `faqs`, `totalUnits`, `totalTowers`, `tour360Url`,
 *    `constructionPercent`, `launchDate`, `actualPossession`,
 *    `paymentPlanType`, `paymentPlanDescription`, `address`, `builder` are
 *    confirmed genuinely absent from this page (no section/field exists for
 *    them) -- classifyProjectEnrichment() correctly reports these MISSING.
 *
 * As tolerant of missing/malformed sections as the Godrej/Adani adapters
 * (Part I): every field extraction is independent.
 */
export function extractKalpataruVianFacts(html: string): SourceFactsMap {
  const facts: SourceFactsMap = {};

  const title = extractTitle(html);
  if (title) facts.metaTitle = { value: title, confidence: "High" };

  const description = extractMetaDescription(html);
  if (description) facts.metaDescription = { value: description, confidence: "High" };

  const ogImageFact = fact(html.match(OG_IMAGE_PATTERN)?.[1], "High");
  if (ogImageFact) {
    facts.ogImageUrl = ogImageFact;
    facts.coverImage = { ...ogImageFact, note: "Same banner image the page itself publishes as og:image." };
  }

  try {
    const organization = extractLdJsonBlocks(html).find((b) => b["@type"] === "Organization") as { name?: unknown } | undefined;
    const developerFact = fact(
      typeof organization?.name === "string" ? organization.name : undefined,
      "High",
      { note: "Official site's own Organization structured data (JSON-LD name)." }
    );
    if (developerFact) facts.developerGroup = developerFact;
  } catch {
    /* ignore -- JSON-LD block missing/malformed shouldn't block anything else */
  }

  try {
    const videoBlocks = extractLdJsonBlocks(html).filter((b) => b["@type"] === "ItemList");
    for (const block of videoBlocks) {
      const items = Array.isArray(block.itemListElement) ? (block.itemListElement as Record<string, unknown>[]) : [];
      const videos = items.filter((i) => i["@type"] === "VideoObject" && typeof i.contentUrl === "string" && (i.contentUrl as string).trim());
      if (videos.length) {
        facts.videoUrl = {
          value: (videos[0].contentUrl as string).trim(),
          confidence: "High",
          note:
            videos.length > 1
              ? `${videos.length} videos found in the page's own JSON-LD ItemList; showing the first ("${videos[0].name ?? "untitled"}").`
              : undefined,
        };
        break;
      }
    }
  } catch {
    /* ignore */
  }

  const name = fact(html.match(/<div class="p_title">([^<]+)<\/div>/i)?.[1], "High", {
    note: "Page's own banner project-name element.",
  });
  if (name) facts.name = name;

  const rawStatus = extractLabeledLine(html, "Status");
  if (rawStatus) {
    const mappedStatus = unambiguousStatusFromBadgeLabel(rawStatus);
    if (mappedStatus) {
      facts.status = {
        value: STATUS_LABEL[mappedStatus],
        confidence: "High",
        note: `Page's own status label ("${rawStatus}") mapped via this codebase's existing CONSTRUCTION_BADGE_LABEL.${mappedStatus} ("${CONSTRUCTION_BADGE_LABEL[mappedStatus]}") -- an unambiguous, already-defined mapping, not a guess.`,
      };
    }
    // An ambiguous or unrecognized label is deliberately left unmapped rather
    // than guessed -- status correctly reports MISSING in that case.
  }

  const rawLocation = extractLabeledLine(html, "Location");
  if (rawLocation) {
    facts.locality = {
      value: rawLocation,
      confidence: "High",
      note: "Page's own labeled Location line -- a mismatch here may reflect formatting/granularity rather than a real disagreement with the administrative locality name.",
    };
    facts.microMarket = { value: rawLocation, confidence: "High", note: "Same labeled Location line, offered here as the street-level micro-market descriptor." };
  }

  const rawPrice = extractLabeledLine(html, "Price");
  if (rawPrice) {
    const minRupees = parseStartingPriceToMinRupees(rawPrice);
    if (minRupees !== null) {
      facts.priceMin = {
        value: formatPaise(minRupees * 100),
        confidence: "High",
        note: `Page's own labeled Price line ("${rawPrice}") -- a "starting from" figure, used only as a minimum. No price maximum is ever stated on this page, so priceMax is correctly left MISSING rather than invented.`,
      };
    }
  }

  const rawPossession = extractLabeledLine(html, "Possession");
  if (rawPossession) {
    const parsed = parsePossessionMonthYear(rawPossession);
    if (parsed) {
      facts.possessionMonth = { value: parsed.month, confidence: "High", note: `Page's own labeled Possession line ("${rawPossession}").` };
      facts.possessionYear = { value: parsed.year, confidence: "High" };
    }
  }

  // Every gtag tracking call on this page consistently labels the property
  // as `property_type: 'residential'` -- the same signal the JSON-LD
  // RealEstateAgent block corroborates. Confirmed against the real page, not
  // assumed from the developer's general residential focus.
  if (/property_type:\s*'residential'/i.test(html) || /property_type:\s*"residential"/i.test(html)) {
    facts.category = { value: CATEGORY_LABEL.RESIDENTIAL, confidence: "High", note: "Consistent across every gtag tracking call on the page." };
  }

  const reraNumberFact = fact(html.match(/registration no\.\s*([A-Za-z0-9]+)/i)?.[1], "High", {
    note: "Page's own RERA disclaimer paragraph -- a real MahaRERA registration number.",
  });
  if (reraNumberFact) {
    facts.reraNumber = reraNumberFact;
    facts.reraStatus = {
      value: "Registered",
      confidence: "High",
      note: "Inferred from the page's own disclaimer citing a real MahaRERA registration number and a link to the official maharera.mahaonline.gov.in portal, not from marketing prose.",
    };
  }

  const registeredAs = fact(html.match(/registered with MahaRERA as\s*&quot;([^&"]+)&quot;/i)?.[1] ?? html.match(/registered with MahaRERA as\s*"([^"]+)"/i)?.[1], "Medium", {
    ambiguous: true,
    note: 'The page\'s own disclaimer registers this project with MahaRERA under the name "Kalpataru Hrushikesh" -- a real, differing corporate/registration name from the marketing name "Kalpataru Vian" shown everywhere else on the page. Surfaced as a tagline-adjacent fact for human confirmation, never silently substituted for `name`.',
  });
  if (registeredAs) {
    facts.tagline = registeredAs;
  }

  // HTML comments are stripped BEFORE tag-stripping: the real page has a
  // leftover commented-out blurb for an unrelated project (Kalpataru Summit)
  // sitting inside this exact paragraph -- a naive tag-strip alone would
  // silently splice another project's marketing copy into this one's tagline.
  const overviewRaw = html.match(/<p class="project-inner-description">([\s\S]*?)<\/p>/i)?.[1];
  const overviewText = fact(overviewRaw?.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), "Medium", {
    ambiguous: true,
    note: 'Marketing prose from the page\'s own "Overview" section -- needs editorial shortening/approval, not a verbatim fact.',
  });
  // Prefer the disclaimer's registered-name finding for `tagline` when both exist
  // (a real naming discrepancy is a more important human-review signal than
  // restating marketing copy) -- otherwise fall back to the overview prose.
  if (!facts.tagline && overviewText) facts.tagline = overviewText;

  const keyBenefits = extractKeyBenefits(html);
  const landAreaBullet = keyBenefits.find((b) => /acres?/i.test(b));
  if (landAreaBullet) {
    const acres = parseApproxAcres(landAreaBullet);
    if (acres) {
      facts.landAreaAcres = {
        value: acres,
        confidence: "Medium",
        ambiguous: true,
        note: `Page's own Key Benefits bullet reads "${landAreaBullet}" -- explicitly an approximation ("Approx."), not a settled figure.`,
      };
    }
  }
  if (keyBenefits.length) {
    facts.highlights = {
      value: `${keyBenefits.length} listed`,
      confidence: "High",
      note: `Page's own labeled "Key Benefits" bullet list: ${keyBenefits.join(" | ")}.`,
      items: keyBenefits,
    };
  }

  const amenities = extractAmenities(html);
  if (amenities.length) {
    facts.amenities = {
      value: `${amenities.length} selected`,
      confidence: "High",
      note: `Named list from the page's own categorized amenities accordion: ${amenities.join(", ")}. One entire category ("Terrace Level Amenities") is HTML-commented-out on the live page and deliberately excluded here.`,
      items: amenities,
    };
  }

  const brochureFact = fact(extractDownloadLink(html, "Brochure"), "High", {
    note: "Page's own labeled Resources/downloads list -- publicly linked, no lead form or login required.",
  });
  if (brochureFact) facts.brochure = brochureFact;

  const opportunityDocketUrl = extractDownloadLink(html, "Opportunity Docket");
  if (opportunityDocketUrl) {
    facts.documents = {
      value: "1 document(s)",
      confidence: "High",
      note: "Page's own labeled Resources/downloads list: Opportunity Docket.",
      items: [opportunityDocketUrl],
    };
  }

  // Deliberately NOT populated -- confirmed genuinely absent, mismapped, or
  // not a curated/interactive asset on this page (Phase 38 inspection), not a
  // parsing failure: priceMax, latitude, longitude, address, builder,
  // specifications, faqs, totalUnits, totalTowers, tour360Url, images,
  // constructionPercent, launchDate, actualPossession, paymentPlanType,
  // paymentPlanDescription, reraCertificateUrl, googleMapsUrl (a real,
  // page-embedded shortlink exists but was deliberately left unresolved --
  // see doc comment above).

  return facts;
}

/**
 * Real, live OfficialSourceAdapter for Kalpataru (Phase 38 -- third-developer
 * generalization proof). Same contract as godrejPropertiesAdapter /
 * adaniRealtyAdapter: a genuine `fetch()`, no fixture data, throws on fetch
 * failure so the caller can distinguish "source unavailable" from "found
 * nothing."
 */
export const kalpataruAdapter: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",

  resolveDomain(developerGroup: string): string | null {
    return resolveDeveloperDomain(developerGroup);
  },

  async fetchProjectFacts(projectUrl: string): Promise<SourceFactsMap> {
    const response = await fetch(projectUrl, {
      headers: { "User-Agent": FETCH_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Kalpataru page fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    return extractKalpataruVianFacts(html);
  },
};

/** The one curated project page this MVP knows how to enrich for Kalpataru (Phase 38). */
export const KALPATARU_VIAN_PROJECT_URL = "https://www.kalpataru.com/mumbai/kalpataru-vian";
