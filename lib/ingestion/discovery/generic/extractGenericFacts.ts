import type { EnrichmentConfidence } from "@/lib/enrichment/types";

/**
 * Phase 55 Part C — the GENERIC (developer-agnostic) project-page extractor.
 * Deliberately shallow, matching Part C's own instruction ("Discovery only
 * needs enough information to safely create a DiscoveryCandidate", not a
 * full enrichment-quality extraction): projectName, an area/location text
 * guess, raw status evidence text, and an optional RERA number. No amenity/
 * price/possession extraction here — that remains enrichment's job, on the
 * SAME curated per-developer adapters this phase never replaces (Part D).
 *
 * Signal priority mirrors every hand-built adapter in this codebase:
 * structured JSON-LD first, then `<title>`/meta tags, since a developer site
 * publishing real JSON-LD is a stronger, more reliably-parseable signal than
 * scraping visible text.
 *
 * Phase 56 — real Phase 55 discovery runs against 20 real developers surfaced
 * two concrete accuracy problems this file now fixes directly:
 *  1. A JSON-LD `name` field is sometimes a marketing SENTENCE, not a project
 *     name (the "garbled Piramal Revanta" case) — `assessProjectNameQuality`
 *     now gates every name candidate, falling through to the next-best source
 *     rather than accepting garbage (Part D).
 *  2. Locality text relied on JSON-LD address alone, missing genuine Mumbai
 *     locality evidence sitting in the title/OG title/breadcrumbs/canonical
 *     URL/URL slug of pages that simply don't publish a structured address
 *     (Part A) — `areaEvidence` now returns EVERY tier found, ranked, for the
 *     caller (decideCandidateFate.ts) to resolve against the real Locality
 *     table in priority order.
 */

const RERA_NUMBER_PATTERN = /\bP[A-Z]?\d{9,13}\b/;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/**
 * Phase 56 rerun -- real titles/OG-titles come through as raw, un-decoded
 * HTML ("Luxurious 3 &amp; 4 BHK Flats..."), which previously reached both
 * the founder-facing UI AND duplicate-name normalization (duplicateMatch.ts)
 * still literally containing "&amp;" — normalizeName's alnum-only strip
 * turns that into a bogus extra word ("amp"), corrupting Jaccard similarity.
 * Decoding once, right at extraction, fixes both the display and the
 * downstream duplicate match in one place rather than patching each
 * consumer separately.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (full: string, name: string) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? full)
    .replace(/\s+/g, " ")
    .trim();
}

interface JsonLdNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

function extractJsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const pattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed?.["@graph"])) nodes.push(...(parsed["@graph"] as JsonLdNode[]));
      else if (Array.isArray(parsed)) nodes.push(...(parsed as JsonLdNode[]));
      else if (parsed && typeof parsed === "object") nodes.push(parsed as JsonLdNode);
    } catch {
      // Skip a malformed block rather than fail the whole page — same discipline as every per-developer adapter.
    }
  }
  return nodes;
}

function hasType(node: JsonLdNode, type: string): boolean {
  return Array.isArray(node["@type"]) ? node["@type"].includes(type) : node["@type"] === type;
}

const PROJECT_LIKE_TYPES = ["ApartmentComplex", "Product", "RealEstateListing", "Residence", "House", "Apartment"];

function findProjectNode(nodes: JsonLdNode[]): JsonLdNode | undefined {
  return nodes.find((n) => PROJECT_LIKE_TYPES.some((t) => hasType(n, t)));
}

function findBreadcrumbNode(nodes: JsonLdNode[]): JsonLdNode | undefined {
  return nodes.find((n) => hasType(n, "BreadcrumbList"));
}

function extractMetaContent(html: string, attrName: "name" | "property", attrValue: string): string | null {
  const pattern = new RegExp(`<meta[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']*)["']`, "i");
  const altPattern = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrValue}["']`, "i");
  const m = html.match(pattern) ?? html.match(altPattern);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtmlEntities(m[1]) : null;
}

/**
 * Splits a title/OG-title-shaped string on its common separators (pipe,
 * en/em dash always, a plain hyphen only when it's clearly standing in for
 * one of those — i.e. padded by whitespace on both sides) into every
 * segment, e.g. "Piramal Mahalaxmi | Piramal Realty" -> ["Piramal
 * Mahalaxmi", "Piramal Realty"]. Phase 56 regression: some developer SEO
 * templates put a generic phrase FIRST and the real project name in a LATER
 * segment (e.g. "New Flats in Mulund | Piramal Revanta Luxury Homes") — the
 * caller tries every segment against the name-quality gate in order, rather
 * than blindly trusting segment 0.
 *
 * Second Phase 56-rerun regression: a bare `-` with NO required surrounding
 * whitespace (the original pattern) also splits mid-word compound hyphens
 * like "Ready-to-Move", shredding a real title into meaningless one-word
 * fragments ("Ready") that then slip past the name-quality gate purely by
 * being too short to trip any of its checks. A real title-separator hyphen
 * is essentially always padded with spaces (`"Title - Subtitle"`); a
 * compound-word hyphen never is — so only the padded form is treated as a
 * separator now.
 */
function titleSegments(title: string): string[] {
  return title
    .split(/\s*[|–—]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Part D — project-name quality gate
// ---------------------------------------------------------------------------

const JUNK_NAME_PATTERNS: RegExp[] = [
  /cookies?/i,
  /privacy polic/i,
  /all rights reserved/i,
  /subscribe/i,
  /newsletter/i,
  /terms (of|and) (use|service|conditions)/i,
  /\bsign in\b/i,
  /\bsign up\b/i,
  /\bread more\b/i,
  /\bclick here\b/i,
  /skip to content/i,
  /page not found/i,
  /^home$/i,
  /^welcome(?:\s+to\b.*)?$/i,
  /^properties$/i,
  /^projects$/i,
  /^our projects$/i,
  /^contact us$/i,
  /^about us$/i,
  /^menu$/i,
  /^navigation$/i,
  /^404$/,
  // Phase 56 — real generic real-estate SEO landing-page headings observed in
  // the actual Phase 55 rerun ("New Projects in Byculla", "Flats in
  // Mazgaon", "Best Ongoing Residential Projects in Mumbai", "Ready to Move
  // Flats in Mahalaxmi", "3,4 BHK Luxury Apartments in Bandra West"). These
  // are short enough to dodge the stopword-ratio check below, so they need
  // their own explicit shape rule: a real-estate generic noun (flats/homes/
  // apartments/properties/residences/projects/BHK) followed within a short
  // span by a locality preposition (in/near/for sale in) and a place name —
  // never a real project's own brand name.
  /\b(?:flats|homes|apartments|properties|residences|projects|bhk)\b[\s\S]{0,40}\b(?:in|near|for sale in)\b\s+[A-Za-z]/i,
  // Phase 56 rerun -- real developer blog platforms (MICL's among them) reuse
  // the exact same og:title ("MICL Blog") across every article page; a real
  // project is never itself named "<Developer> Blog".
  /\bblog\b/i,
];

const NAME_STOPWORDS = new Set([
  "the","and","with","for","your","is","to","of","in","on","at","by","from","that","this",
  "are","you","we","our","a","an","it","as","or","be","will","can","new","best","top",
]);

export interface ProjectNameQuality {
  ok: boolean;
  reason?: string;
}

/**
 * Pure. Rejects text that isn't shaped like a real project name -- a
 * marketing sentence, a nav/legal/cookie label, or an obviously garbled
 * string -- WITHOUT rejecting legitimately long real project names (Part D:
 * "Keep legitimate long project names"). Deliberately conservative: only
 * fires on strong, specific signals (explicit junk phrases, sentence-ending
 * punctuation, or a high stopword ratio typical of prose), never on mere
 * length alone below the sentence-length ceiling.
 */
export function assessProjectNameQuality(rawName: string): ProjectNameQuality {
  const name = rawName.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name.length > 90) return { ok: false, reason: "too long to be a project name — reads like a sentence or paragraph" };

  for (const pattern of JUNK_NAME_PATTERNS) {
    if (pattern.test(name)) return { ok: false, reason: `matches a known junk/navigation/legal text pattern (${pattern})` };
  }

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 12) return { ok: false, reason: "too many words to be a project name" };

  if (/[.!?]$/.test(name) && words.length > 3) return { ok: false, reason: "ends like a sentence" };

  if (words.length >= 5) {
    const stopwordCount = words.filter((w) => NAME_STOPWORDS.has(w.toLowerCase())).length;
    if (stopwordCount / words.length >= 0.4) return { ok: false, reason: "reads like a marketing sentence — too many common English words for a project name" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Part A — ranked locality evidence
// ---------------------------------------------------------------------------

export type AreaEvidenceSource =
  | "json_ld_address"
  | "page_content"
  | "title_tag"
  | "og_title"
  | "breadcrumbs"
  | "canonical_url"
  | "url_slug"
  | "other_structured_metadata";

export interface AreaEvidenceItem {
  text: string;
  source: AreaEvidenceSource;
}

const PAGE_CONTENT_LOCATION_PATTERN =
  /\b(?:located in|situated in|nestled in|located at|situated at|located near|in the heart of)\s+([A-Z][A-Za-z0-9.'\s]{2,50}?)(?=[.,;<\n]|$)/;

function extractPageContentAreaText(bodyText: string): string | null {
  const m = bodyText.match(PAGE_CONTENT_LOCATION_PATTERN);
  return m ? m[1].trim() : null;
}

function extractCanonicalUrl(html: string): string | null {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return m ? m[1].trim() : null;
}

function urlToReadableSlug(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;
    const leaf = segments[segments.length - 1];
    const readable = leaf.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    return readable.length >= 3 ? readable : null;
  } catch {
    return null;
  }
}

function extractBreadcrumbAreaText(nodes: JsonLdNode[], developerName?: string | null): string | null {
  const breadcrumbNode = findBreadcrumbNode(nodes);
  const items = breadcrumbNode?.itemListElement;
  if (!Array.isArray(items)) return null;

  const names = items
    .map((item) => {
      if (item && typeof item === "object") {
        const asRecord = item as Record<string, unknown>;
        if (typeof asRecord.name === "string") return asRecord.name.trim();
        const nestedItem = asRecord.item as Record<string, unknown> | undefined;
        if (nestedItem && typeof nestedItem.name === "string") return (nestedItem.name as string).trim();
      }
      return null;
    })
    .filter((n): n is string => Boolean(n))
    .filter((n) => !/^home$/i.test(n) && n.toLowerCase() !== (developerName ?? "").toLowerCase());

  return names.length > 0 ? names.join(", ") : null;
}

/** A lightweight, non-JSON-LD breadcrumb fallback for sites that render breadcrumbs as plain markup (`<nav ... breadcrumb ...>` / `class="breadcrumb"`) rather than structured data. Shallow, regex-based like every other extractor in this file. */
function extractHtmlBreadcrumbAreaText(html: string): string | null {
  const m = html.match(/<(?:nav|ol|ul|div)[^>]*(?:breadcrumb)[^>]*>([\s\S]*?)<\/(?:nav|ol|ul|div)>/i);
  if (!m) return null;
  const linkTexts = [...m[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map((x) => decodeHtmlEntities(x[1])).filter(Boolean);
  const filtered = linkTexts.filter((t) => !/^home$/i.test(t));
  return filtered.length > 0 ? filtered.join(", ") : null;
}

export interface GenericPageFacts {
  projectNameGuess: string | null;
  projectNameSource: "json_ld" | "title_tag" | "og_title" | null;
  /** Best (highest-priority) area text guess — kept for convenience/logging; callers doing real locality resolution should use `areaEvidence` (Phase 56 Part A), which carries every tier found. */
  areaTextGuess: string | null;
  areaTextSource: AreaEvidenceSource | null;
  /** Every locality-evidence tier this page actually yielded, ranked most-confident first (Phase 56 Part A). */
  areaEvidence: AreaEvidenceItem[];
  reraNumber: string | null;
  /** The raw phrase(s) found on the page that speak to construction/sales status -- evidence for classifyGenericProjectStatus, never itself a status classification. */
  statusEvidenceText: string | null;
  descriptionGuess: string | null;
  /** JSON-LD `brand.name`, when present -- e.g. a third-party listing page's own structured developer/brand field. Phase 67: exposed for callers (Housiey secondary discovery) that don't already know the developer name the way a per-developer-sitemap crawl does. Never guessed from unstructured text. */
  developerNameGuess: string | null;
  hasProjectLikeJsonLd: boolean;
  confidence: EnrichmentConfidence;
}

const STATUS_EVIDENCE_PHRASES = [
  "under construction",
  "nearing possession",
  "possession expected",
  "possession by",
  "newly launched",
  "new launch",
  "now launched",
  "expression of interest",
  "eoi open",
  "pre-launch",
  "prelaunch",
  "coming soon",
  "launching soon",
  "sold out",
  "fully sold",
  "ready to move",
  "possession handed over",
  "delivered",
  "completed",
];

/**
 * Phase 56 Part C — strips common SITE-WIDE chrome (header/nav/footer, plus
 * any element whose own class/id names it as a global status widget/badge/
 * ticker/announcement bar) before status-phrase scanning, so a developer's
 * sitewide "Under Construction" banner (present on every page, including
 * pages for delivered/sold-out projects) can no longer masquerade as
 * project-specific evidence. Shallow, single-element regex removal — matches
 * this module's existing "no HTML parser dependency" discipline — not a full
 * nesting-aware strip, so it intentionally only targets elements whose OWN
 * opening tag carries one of these marker class/id names.
 */
function stripSitewideChrome(html: string): string {
  let out = html.replace(/<header[\s\S]*?<\/header>/gi, "");
  out = out.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  out = out.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  out = out.replace(
    /<[^>]+(?:class|id)=["'][^"']*(?:sitewide|global-status|status-widget|status-badge|construction-status|announcement-bar|promo-bar|top-bar|global-banner|site-banner)[^"']*["'][^>]*>[\s\S]*?<\/[a-z0-9]+>/gi,
    ""
  );
  return out;
}

/**
 * Pure. Given one already-fetched page's HTML (and, when available, the
 * exact URL it was fetched from — used only for canonical/URL-slug locality
 * evidence, Part A), extracts the minimal set of discovery-grade facts.
 * Confidence: High only when a project-shaped JSON-LD node supplied the
 * name; Medium when only title/meta tags did; Low when nothing usable was
 * found at all (still returned, never thrown — the orchestrator decides
 * what to do with a Low-confidence result).
 */
export function extractGenericProjectFacts(html: string, pageUrl?: string): GenericPageFacts {
  const nodes = extractJsonLdNodes(html);
  const projectNode = findProjectNode(nodes);
  const developerNameHint = typeof projectNode?.brand === "object" ? ((projectNode.brand as Record<string, unknown>).name as string | undefined) : undefined;

  // --- Part D: project name, quality-gated, falling through to the next-best
  // source (and, within a source, the next title/OG-title segment) rather
  // than accepting garbage. ---
  const nameCandidates: { value: string; source: NonNullable<GenericPageFacts["projectNameSource"]> }[] = [];
  if (projectNode && typeof projectNode.name === "string" && projectNode.name.trim()) {
    for (const seg of titleSegments(projectNode.name.trim())) nameCandidates.push({ value: seg, source: "json_ld" });
  }
  const ogTitleRaw = extractMetaContent(html, "property", "og:title");
  if (ogTitleRaw) for (const seg of titleSegments(ogTitleRaw)) nameCandidates.push({ value: seg, source: "og_title" });
  const titleTagRaw = extractTitleTag(html);
  if (titleTagRaw) for (const seg of titleSegments(titleTagRaw)) nameCandidates.push({ value: seg, source: "title_tag" });

  let projectNameGuess: string | null = null;
  let projectNameSource: GenericPageFacts["projectNameSource"] = null;
  for (const candidate of nameCandidates) {
    if (assessProjectNameQuality(candidate.value).ok) {
      projectNameGuess = candidate.value;
      projectNameSource = candidate.source;
      break;
    }
  }

  // --- Part A: ranked locality evidence — every tier that produced something, most confident first. ---
  const areaEvidence: AreaEvidenceItem[] = [];
  const address = projectNode?.address as { addressLocality?: string; streetAddress?: string } | undefined;
  if (address?.addressLocality) {
    const text = address.streetAddress ? `${address.streetAddress}, ${address.addressLocality}` : address.addressLocality;
    areaEvidence.push({ text, source: "json_ld_address" });
  }

  const chromeless = stripSitewideChrome(html);
  const pageContentArea = extractPageContentAreaText(chromeless);
  if (pageContentArea) areaEvidence.push({ text: pageContentArea, source: "page_content" });

  if (titleTagRaw) areaEvidence.push({ text: titleTagRaw, source: "title_tag" });
  if (ogTitleRaw) areaEvidence.push({ text: ogTitleRaw, source: "og_title" });

  const breadcrumbArea = extractBreadcrumbAreaText(nodes, developerNameHint) ?? extractHtmlBreadcrumbAreaText(html);
  if (breadcrumbArea) areaEvidence.push({ text: breadcrumbArea, source: "breadcrumbs" });

  const canonicalUrl = extractCanonicalUrl(html);
  const canonicalSlug = canonicalUrl ? urlToReadableSlug(canonicalUrl) : null;
  if (canonicalSlug) areaEvidence.push({ text: canonicalSlug, source: "canonical_url" });

  const fetchedSlug = pageUrl ? urlToReadableSlug(pageUrl) : null;
  if (fetchedSlug) areaEvidence.push({ text: fetchedSlug, source: "url_slug" });

  const geoPlacename = extractMetaContent(html, "name", "geo.placename");
  if (geoPlacename) areaEvidence.push({ text: geoPlacename, source: "other_structured_metadata" });

  const reraMatch = html.match(RERA_NUMBER_PATTERN);

  const description =
    (typeof projectNode?.description === "string" ? projectNode.description : null) ?? extractMetaContent(html, "name", "description");

  // Status evidence: project-specific text first (the JSON-LD node's own
  // description), then a bounded slice of the page with site-wide chrome
  // already stripped (Part C) — never the raw, unstripped page.
  const searchText = `${description ?? ""} ${chromeless.slice(0, 20000)}`.toLowerCase();
  const foundPhrase = STATUS_EVIDENCE_PHRASES.find((p) => searchText.includes(p));

  return {
    projectNameGuess,
    projectNameSource,
    areaTextGuess: areaEvidence[0]?.text ?? null,
    areaTextSource: areaEvidence[0]?.source ?? null,
    areaEvidence,
    reraNumber: reraMatch ? reraMatch[0] : null,
    statusEvidenceText: foundPhrase ?? null,
    descriptionGuess: description,
    developerNameGuess: developerNameHint?.trim() || null,
    hasProjectLikeJsonLd: Boolean(projectNode),
    confidence: projectNameSource === "json_ld" ? "High" : projectNameSource ? "Medium" : "Low",
  };
}
