/**
 * Phase 60 Part 8 — productionizes the pattern-matching Phase 58 did by hand
 * against real bad records found in the Project Review Queue: scraped
 * "project names" that are actually a subpage title, a marketing sentence,
 * or a developer/category heading rather than a real project identity.
 *
 * Deliberately dumb and deterministic (no LLM) — pure regex over the name
 * string, same discipline as projectUrlHeuristics.ts's URL-shape checks.
 * Never claims a name IS bad with certainty; it's one more signal the
 * automation layer routes to REJECT/HUMAN_REVIEW, exactly like
 * projectUrlHeuristics.ts's `likely` is one signal for whether to fetch a
 * URL at all — a human still makes the final call.
 */

export interface SubpageTitleCheckResult {
  suspicious: boolean;
  reason: string | null;
}

/** Real failures from Phase 58 (see that phase's audit): a name-shaped string is often actually a subpage heading concatenated onto the real project name. */
const SUBPAGE_SUFFIX_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /location\s*(&|and)?\s*address/i, reason: 'Name contains "Location & Address" — this is a location subpage title, not a project identity.' },
  { pattern: /price\s*list/i, reason: 'Name contains "Price List" — this is a price subpage title, not a project identity.' },
  { pattern: /floor\s*plans?/i, reason: 'Name contains "Floor Plan(s)" — this is a floor-plan subpage title, not a project identity.' },
  { pattern: /payment\s*plans?/i, reason: 'Name contains "Payment Plan(s)" — this is a payment-plan subpage title, not a project identity.' },
  { pattern: /\bamenities\b\s*(list|page)?$/i, reason: 'Name ends with "Amenities" — this is an amenities subpage title, not a project identity.' },
  { pattern: /\breview[s]?$/i, reason: 'Name ends with "Review(s)" — this is a review/article title, not a project identity.' },
  { pattern: /\bbrochure$/i, reason: 'Name ends with "Brochure" — this is a document page title, not a project identity.' },
];

/** Real failures from Phase 58: "JP Parkway – Residential Project by JP Infra", "ICONS 71 – Luxury Residences in Chembur, Mumbai" — a real project name with an SEO/marketing descriptor bolted on via a dash/colon separator. */
const MARKETING_DESCRIPTOR_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /[–\-:]\s*residential\s*project\s*by\s+/i, reason: 'Name contains "– Residential Project by ..." — an SEO descriptor bolted onto the real project name.' },
  { pattern: /[–\-:]\s*luxury\s*residences?\s*(in|at)\s+/i, reason: 'Name contains "– Luxury Residences in/at ..." — an SEO descriptor bolted onto the real project name.' },
  { pattern: /\bnew\s*launch\s*(in|at)\s+mumbai\b/i, reason: 'Name contains a generic "New Launch in Mumbai" marketing phrase, not a project identity.' },
  { pattern: /\bprojects?\s+in\s+mumbai\b/i, reason: 'Name contains a generic "project(s) in Mumbai" category heading, not a specific project identity.' },
];

/** Real failure from Phase 58: "Looking for ready to flats in Mumbai? Explore Piramal Revanta, a property in Mulund offering 1 - 5BHK flats..." — a full marketing sentence (often a meta description) scraped in as the name. */
const MARKETING_SENTENCE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^\s*(looking for|explore|discover|find your|book your)\b/i, reason: "Name starts with a marketing sentence opener (\"Looking for\"/\"Explore\"/\"Discover\"/...) rather than a project identity." },
  { pattern: /\?/, reason: "Name contains a question mark — this reads as a marketing sentence/headline, not a project identity." },
];

const ALL_PATTERN_GROUPS = [SUBPAGE_SUFFIX_PATTERNS, MARKETING_DESCRIPTOR_PATTERNS, MARKETING_SENTENCE_PATTERNS];

/** A plain marketing sentence is also just unusually long for a project name — a secondary, weaker signal only used to corroborate, never fired alone. */
const LONG_NAME_THRESHOLD = 90;

/**
 * Pure. Returns the first matching known-bad pattern's reason, or
 * `suspicious: false` if nothing matched — never a partial/fuzzy verdict.
 * Case-insensitive throughout; never rejects on length alone (a long but
 * otherwise clean name is never flagged by this function by itself).
 */
export function looksLikeSubpageOrMarketingTitle(name: string): SubpageTitleCheckResult {
  const trimmed = name.trim();
  for (const group of ALL_PATTERN_GROUPS) {
    for (const { pattern, reason } of group) {
      if (pattern.test(trimmed)) return { suspicious: true, reason };
    }
  }
  if (trimmed.length > LONG_NAME_THRESHOLD) {
    return {
      suspicious: true,
      reason: `Name is unusually long (${trimmed.length} characters) for a project identity — likely a scraped sentence or SEO title rather than a real name.`,
    };
  }
  return { suspicious: false, reason: null };
}
