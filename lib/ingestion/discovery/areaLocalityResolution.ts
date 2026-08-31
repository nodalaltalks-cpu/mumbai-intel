import { resolveLocalityMatch, type EntityMatchCandidate } from "../../enrichment/resolveNamedEntity";

/**
 * Phase 43 Part E/F — solves the real Kalpataru Vian problem ("Hrushikesh,
 * Lokhandwala, Andheri (W)" failing to resolve to the Locality "Andheri
 * West") WITHOUT globally lowering resolveLocalityMatch's own fuzzy
 * threshold (Phase 42's fix) and without duplicating IGR's own Locality
 * resolution approach (Part F: transactionFileImportRunner.ts resolves
 * locality names via an EXACT lookup against Locality.name/LocalityAlias
 * only -- deliberately no fuzzy tier at all, since a wrong IGR match would
 * misattribute a real registered transaction. That strict discipline is
 * right for IGR's already-clean government data, but discovery/enrichment
 * area strings are naturally messier free text from third-party pages —
 * reusing IGR's zero-fuzzy approach as-is would refuse nearly every real
 * discovery candidate. So this module reuses the SAME LocalityAlias table
 * IGR already reads, adds ONE additional tier in between exact-match and
 * fuzzy-match, and leaves resolveLocalityMatch itself untouched.)
 *
 * Five tiers (Part E), most confident first:
 *  1/2. EXACT locality name or LocalityAlias match on the FULL areaName
 *       string (resolveLocalityMatch's own tier 1, reused verbatim).
 *  3.   EXACT name/alias match on each COMMA-SEPARATED SEGMENT of areaName
 *       (checked last-to-first, since "<micro-market>, <city-locality>" is
 *       the real address convention every Phase 41 candidate actually uses)
 *       -- OR a hit against the small curated MICRO_MARKET_TO_LOCALITY map
 *       below, for a segment that names a real neighbourhood but isn't
 *       itself a Locality row or alias (e.g. "Lokhandwala" alone).
 *  4.   Fuzzy match on the full string (resolveLocalityMatch's own tier 2,
 *       reused verbatim, unchanged from Phase 33).
 *  5.   MULTIPLE_MATCHES / NO_MATCH.
 *
 * Never creates a Locality. Every non-exact resolution still surfaces which
 * tier produced it, so a human can see "this was a micro-market inference,
 * not a literal name match" rather than it looking indistinguishable from
 * an exact hit.
 */
export type AreaLocalityStatus = "SINGLE_MATCH" | "MULTIPLE_MATCHES" | "NO_MATCH";
export type AreaLocalityTier = "EXACT" | "MICRO_MARKET" | "FUZZY";

export interface AreaLocalityMatch {
  status: AreaLocalityStatus;
  localityId?: string;
  localityName?: string;
  tier?: AreaLocalityTier;
  /** Only set for MULTIPLE_MATCHES -- every candidate, so a human picks rather than the system guessing. */
  candidates?: EntityMatchCandidate[];
}

export interface ExistingLocalityWithAliases {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * A small, hand-curated map of well-known Mumbai neighbourhood/micro-market
 * names to the EXISTING Locality they sit within -- the discovery-specific
 * analogue of developerDomainRegistry.ts's own curated, never-guessed
 * discipline. Every key here was confirmed against a REAL Phase 41/42
 * discovery candidate's own areaName text, not invented speculatively.
 * Values are Locality NAMES (resolved to a real id at lookup time against
 * whatever Localities actually exist), never a hardcoded id -- this never
 * silently creates a Locality if the named target doesn't exist yet.
 */
const MICRO_MARKET_TO_LOCALITY: Record<string, string> = {
  lokhandwala: "Andheri West",
  "lokhandwala complex": "Andheri West",
  "lokhandwala circle": "Andheri West",
  versova: "Andheri West",
  hrushikesh: "Andheri West",
  oshiwara: "Andheri West",
  "d.n. nagar": "Andheri West",
  "dn nagar": "Andheri West",
  "juhu versova link road": "Andheri West",
  "new link road": "Andheri West",
  "yari road": "Andheri West",
  "model town": "Andheri West",
};

function splitSegments(areaName: string): string[] {
  return areaName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function asAreaMatch(result: { status: string; candidates: EntityMatchCandidate[] }, tier: AreaLocalityTier): AreaLocalityMatch | null {
  if (result.status !== "SINGLE_MATCH") return null;
  return { status: "SINGLE_MATCH", localityId: result.candidates[0].id, localityName: result.candidates[0].name, tier };
}

/** True only for an EXACT (tier-1, confidence 1) resolveLocalityMatch result -- never a fuzzy one, so callers of this helper can never accidentally accept a loose match while believing it's exact. */
function exactOnly(result: { status: string; candidates: EntityMatchCandidate[] }): AreaLocalityMatch | null {
  if (result.status !== "SINGLE_MATCH" || result.candidates[0].confidence !== 1) return null;
  return { status: "SINGLE_MATCH", localityId: result.candidates[0].id, localityName: result.candidates[0].name, tier: "EXACT" };
}

export function resolveAreaToLocality(areaName: string, existingLocalities: ExistingLocalityWithAliases[]): AreaLocalityMatch {
  const fullStringMatch = resolveLocalityMatch(existingLocalities, areaName);

  // Tiers 1/2 -- exact match (name or alias) on the whole string.
  const exactFull = exactOnly(fullStringMatch);
  if (exactFull) return exactFull;

  // Tier 3a -- exact match (name or alias) on one comma-separated segment,
  // tried last-to-first (the broadest descriptor is conventionally last).
  const segments = splitSegments(areaName);
  for (const segment of [...segments].reverse()) {
    const segmentMatch = exactOnly(resolveLocalityMatch(existingLocalities, segment));
    if (segmentMatch) return segmentMatch;
  }

  // Tier 3b -- a curated micro-market name (whole string or any segment)
  // resolved to its real containing Locality.
  for (const candidate of [areaName, ...segments]) {
    const targetLocalityName = MICRO_MARKET_TO_LOCALITY[candidate.trim().toLowerCase()];
    if (!targetLocalityName) continue;
    const microMarketMatch = exactOnly(resolveLocalityMatch(existingLocalities, targetLocalityName));
    if (microMarketMatch) return { ...microMarketMatch, tier: "MICRO_MARKET" };
  }

  // Tier 4 -- fuzzy match on the full string (Phase 33's existing tier 2, unchanged).
  const fuzzyFull = asAreaMatch(fullStringMatch, "FUZZY");
  if (fuzzyFull) return fuzzyFull;

  // Tier 5.
  if (fullStringMatch.status === "MULTIPLE_MATCHES") return { status: "MULTIPLE_MATCHES", candidates: fullStringMatch.candidates };
  return { status: "NO_MATCH" };
}
