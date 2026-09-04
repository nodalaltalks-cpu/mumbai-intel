import type { SourceTier, EnrichmentConfidence } from "@/lib/enrichment/types";
import { resolveAreaToLocality, type ExistingLocalityWithAliases, type AreaLocalityMatch } from "../areaLocalityResolution";
import { deriveAreaSearchStrings } from "./areaEvidenceSearch";
import { detectMmrPeripheralArea } from "../mmrBoundary";
import type { AreaEvidenceItem, AreaEvidenceSource } from "./extractGenericFacts";
import type { CandidatePageResult } from "./discoverDeveloperProjects";

/**
 * Part F/G combined — the ONE decision point where a raw generic-discovery
 * candidate becomes either a stageable input (Part I) or a counted-but-not-
 * staged exclusion. Deliberately a pure function over already-computed
 * inputs (candidate facts + the existing Locality table) so every one of
 * Part F/G's rules is independently testable without a database.
 */

export interface StageableDiscoveryInput {
  projectName: string;
  developerName: string;
  areaName: string;
  sourceUrl: string;
  sourceType: SourceTier;
  discoverySource: string;
  confidence: EnrichmentConfidence;
  reraNumber?: string;
}

export type CandidateFate =
  | { decision: "STAGE"; input: StageableDiscoveryInput; localityId: string; localityName: string }
  | { decision: "EXCLUDED_NO_NAME"; reason: string }
  | { decision: "EXCLUDED_STATUS"; reason: string }
  | { decision: "EXCLUDED_NO_LOCATION_TEXT"; reason: string }
  | { decision: "EXCLUDED_LOCATION_UNRESOLVED"; reason: string }
  | { decision: "EXCLUDED_MMR_LOCATION"; reason: string; matchedKeyword: string }
  | { decision: "AMBIGUOUS_LOCATION"; reason: string; candidateLocalityNames: string[] };

/**
 * Phase 56 Part A — locality text pulled from a page's title/OG title/
 * breadcrumbs/canonical URL/URL slug is real signal, but noisier than a
 * structured JSON-LD address (it's a sentence or slug, not a clean address
 * field). These "weak" sources are only trusted for an EXACT or MICRO_MARKET
 * resolver tier — a FUZZY match off a slug fragment is NOT "sufficiently
 * clear" (spec wording) and is treated as unresolved rather than guessed.
 */
const WEAK_AREA_SOURCES: AreaEvidenceSource[] = ["title_tag", "og_title", "breadcrumbs", "canonical_url", "url_slug", "other_structured_metadata"];

interface BestAreaMatch {
  match: AreaLocalityMatch;
  evidence: AreaEvidenceItem;
}

/**
 * Tries each locality-evidence tier IN PRIORITY ORDER (as ranked by
 * extractGenericProjectFacts), and within a tier, every candidate search
 * string derived from its text. Stops at the first tier that produces
 * either a real resolution or a genuine ambiguity — a lower-priority tier
 * is never consulted once a higher-priority one has already spoken, so a
 * noisy title-derived guess can never override a clean JSON-LD address.
 */
function resolveBestAreaMatch(areaEvidence: AreaEvidenceItem[], localities: ExistingLocalityWithAliases[]): BestAreaMatch | null {
  for (const evidence of areaEvidence) {
    const isWeakSource = WEAK_AREA_SOURCES.includes(evidence.source);
    for (const searchString of deriveAreaSearchStrings(evidence.text)) {
      const match = resolveAreaToLocality(searchString, localities);
      if (match.status === "SINGLE_MATCH") {
        if (isWeakSource && match.tier === "FUZZY") continue; // not "sufficiently clear" from a weak source — keep looking within this tier
        return { match, evidence };
      }
      if (match.status === "MULTIPLE_MATCHES") {
        return { match, evidence };
      }
    }
  }
  return null;
}

/** Loose alnum-only normalization, just for the developer-name-as-project-name guard below — mirrors lib/ingestion/duplicateMatch.ts's normalizeName without importing it (that module's threshold-based fuzzy matching is a different job from this exact-equality guard). */
function normalizeForBareNameCheck(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function decideCandidateFate(
  developerName: string,
  domain: string,
  candidate: CandidatePageResult,
  localities: ExistingLocalityWithAliases[],
  /** Phase 67 — lets a non-developer-site caller (e.g. Housiey's secondary-discovery source) tag its own STAGE outputs at the correct, lower trust tier instead of the default. Every existing call site is unaffected (all developer-sitemap discovery genuinely is OFFICIAL_DEVELOPER). */
  sourceType: SourceTier = "OFFICIAL_DEVELOPER"
): CandidateFate {
  if (!candidate.projectNameGuess) {
    return { decision: "EXCLUDED_NO_NAME", reason: "No project name could be extracted from the page (no JSON-LD name, no usable title)." };
  }

  // Phase 56 rerun -- real residual case (Adani Realty -> "Adani Realty",
  // MICL Group -> bare "MICL"): once every marketing-shaped title segment is
  // rejected, the LAST resort left standing is sometimes just the
  // developer's own brand name (in full or short form) repeated in the
  // page's title/og:title. A one-directional SUBSTRING check (rather than
  // exact equality) catches the short-form case too -- "micl" is fully
  // contained in "miclgroup" -- without risking a false reject on a real,
  // longer project name that merely happens to start with the developer's
  // name (that direction is never checked).
  const normalizedName = normalizeForBareNameCheck(candidate.projectNameGuess);
  const normalizedDeveloper = normalizeForBareNameCheck(developerName);
  if (normalizedName.length > 0 && normalizedDeveloper.includes(normalizedName)) {
    return { decision: "EXCLUDED_NO_NAME", reason: `Extracted name "${candidate.projectNameGuess}" is just the developer's own name, not a real project name.` };
  }

  if (candidate.statusBucket === "EXCLUDE") {
    return { decision: "EXCLUDED_STATUS", reason: candidate.statusEvidence };
  }

  if (candidate.areaEvidence.length === 0) {
    return { decision: "EXCLUDED_NO_LOCATION_TEXT", reason: "No location/address text could be extracted from the page — cannot safely assign a Mumbai locality." };
  }

  const best = resolveBestAreaMatch(candidate.areaEvidence, localities);

  if (!best) {
    // Phase 63 — before falling back to the generic "unresolved" bucket,
    // check whether the evidence itself names a well-known MMR/peripheral
    // area. The exclusion outcome is identical either way (this candidate
    // was never going to be staged as a Mumbai project) — this only makes
    // WHY visible, distinguishing a real Thane/Navi Mumbai project from a
    // genuinely unparseable page for the founder-facing metrics.
    for (const evidence of candidate.areaEvidence) {
      const matchedKeyword = detectMmrPeripheralArea(evidence.text);
      if (matchedKeyword) {
        return {
          decision: "EXCLUDED_MMR_LOCATION",
          reason: `Locality evidence "${evidence.text}" (${evidence.source}) names "${matchedKeyword}" — outside Mumbai city (MMR/peripheral), correctly excluded rather than staged.`,
          matchedKeyword,
        };
      }
    }
    return {
      decision: "EXCLUDED_LOCATION_UNRESOLVED",
      reason: `None of this page's locality evidence (${candidate.areaEvidence.map((e) => e.source).join(", ")}) resolved to any existing Mumbai Locality (name/alias/micro-market/fuzzy) — excluded rather than guessed. Not a recognized MMR/peripheral area either; genuinely unparseable from this page's evidence.`,
    };
  }

  if (best.match.status === "MULTIPLE_MATCHES") {
    return {
      decision: "AMBIGUOUS_LOCATION",
      reason: `Locality evidence "${best.evidence.text}" (${best.evidence.source}) matched more than one existing Locality — needs founder review before a locality can be assigned.`,
      candidateLocalityNames: (best.match.candidates ?? []).map((c) => c.name),
    };
  }

  const reviewNote = candidate.statusBucket === "REVIEW" ? ` [Status needs founder verification — ${candidate.statusEvidence}]` : "";

  return {
    decision: "STAGE",
    localityId: best.match.localityId!,
    localityName: best.match.localityName!,
    input: {
      projectName: candidate.projectNameGuess,
      developerName,
      areaName: best.evidence.text,
      sourceUrl: candidate.url,
      sourceType,
      discoverySource: `${domain} ${sourceType === "OFFICIAL_DEVELOPER" ? "sitemap" : "locality page"} — generic discovery (Phase 56, locality evidence: ${best.evidence.source})${reviewNote}`,
      confidence: candidate.confidence,
      reraNumber: candidate.reraNumber ?? undefined,
    },
  };
}
