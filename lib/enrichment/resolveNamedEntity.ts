import {
  findAllPossibleBuilderMatches,
  findAllPossibleLocalityMatches,
  type ExistingBuilderCandidate,
  type ExistingLocalityCandidate,
} from "../ingestion/duplicateMatch";

/**
 * Resolves an enrichment-discovered Builder/Locality NAME against the
 * EXISTING Builder/Locality tables (Phase 33) -- never creates a new row,
 * ever. Reuses the exact fuzzy-matching machinery already in
 * lib/ingestion/duplicateMatch.ts (findAllPossibleBuilderMatches/
 * findAllPossibleLocalityMatches, themselves thin wrappers around that
 * file's existing nameSimilarity()) rather than inventing a second matcher.
 * The only new logic here is turning that same similarity data into three
 * founder-facing states (Part C/D): SINGLE_MATCH, MULTIPLE_MATCHES, NO_MATCH.
 */

export type EntityMatchStatus = "SINGLE_MATCH" | "MULTIPLE_MATCHES" | "NO_MATCH";

export interface EntityMatchCandidate {
  id: string;
  name: string;
  confidence: number;
}

export interface EntityMatchResult {
  status: EntityMatchStatus;
  candidates: EntityMatchCandidate[];
}

export type EntityMatchClassification = "GREEN_NEW" | "CONFIRMED" | "YELLOW" | "CONFLICT" | "MISSING";

export interface EntityMatchProposal {
  key: "builder" | "locality";
  label: string;
  proposedName: string;
  currentId: string | null;
  currentName: string | null;
  match: EntityMatchResult;
  classification: EntityMatchClassification;
}

function normalizeExact(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Tier 1: exact normalized name, OR an exact match against one of the
 * builder's own `legalNames` entries -- this repo's existing equivalent of a
 * BuilderAlias table (Builder.legalNames: "Subsidiary / SPV legal names
 * resolved to this one economic builder", per its own schema comment) rather
 * than a separate alias model. Tier 2 (only if tier 1 finds nothing): the
 * existing fuzzy matcher, returning every candidate above its threshold so
 * true ambiguity (e.g. "Adani Realty" vs "Adani Realty & RC Group" both
 * matching) surfaces as MULTIPLE_MATCHES instead of guessing.
 */
export function resolveBuilderMatch(
  existingBuilders: (ExistingBuilderCandidate & { legalNames: string[] })[],
  proposedName: string
): EntityMatchResult {
  const normalized = normalizeExact(proposedName);
  const exact = existingBuilders.find(
    (b) => normalizeExact(b.name) === normalized || b.legalNames.some((legalName) => normalizeExact(legalName) === normalized)
  );
  if (exact) {
    return { status: "SINGLE_MATCH", candidates: [{ id: exact.id, name: exact.name, confidence: 1 }] };
  }

  const fuzzy = findAllPossibleBuilderMatches(existingBuilders, proposedName);
  if (fuzzy.length === 0) return { status: "NO_MATCH", candidates: [] };
  return {
    status: fuzzy.length === 1 ? "SINGLE_MATCH" : "MULTIPLE_MATCHES",
    candidates: fuzzy.map((f) => ({ id: f.existingId, name: f.name, confidence: f.confidence })),
  };
}

/**
 * Same two-tier discipline as resolveBuilderMatch: tier 1 is an exact
 * normalized match against the locality's own name OR one of its existing
 * LocalityAlias rows (the same alias table transactionFileImportRunner.ts
 * already reads for IGR locality spellings -- reused verbatim here, not
 * reimplemented). Tier 2 is the existing fuzzy matcher.
 */
export function resolveLocalityMatch(
  existingLocalities: (ExistingLocalityCandidate & { aliases: string[] })[],
  proposedName: string
): EntityMatchResult {
  const normalized = normalizeExact(proposedName);
  const exact =
    existingLocalities.find((l) => normalizeExact(l.name) === normalized) ??
    existingLocalities.find((l) => l.aliases.some((alias) => normalizeExact(alias) === normalized));
  if (exact) {
    return { status: "SINGLE_MATCH", candidates: [{ id: exact.id, name: exact.name, confidence: 1 }] };
  }

  const fuzzy = findAllPossibleLocalityMatches(existingLocalities, proposedName);
  if (fuzzy.length === 0) return { status: "NO_MATCH", candidates: [] };
  return {
    status: fuzzy.length === 1 ? "SINGLE_MATCH" : "MULTIPLE_MATCHES",
    candidates: fuzzy.map((f) => ({ id: f.existingId, name: f.name, confidence: f.confidence })),
  };
}

/**
 * Applies the SAME five-state vocabulary classifyProjectEnrichment() already
 * uses for string fields (Part E: "keep the existing GREEN/YELLOW/CONFLICT
 * concepts intact") to an ID-based decision instead of a string diff:
 *  - NO_MATCH            -> MISSING (nothing safe to offer; never create one)
 *  - MULTIPLE_MATCHES     -> YELLOW (genuinely ambiguous, human decides)
 *  - SINGLE_MATCH, blank current  -> GREEN_NEW (safe to add)
 *  - SINGLE_MATCH, matches current -> CONFIRMED (already correct)
 *  - SINGLE_MATCH, differs from current -> CONFLICT (Part H: never silently overwrite)
 */
export function classifyEntityMatch(currentId: string | null, match: EntityMatchResult): EntityMatchClassification {
  if (match.status === "NO_MATCH") return "MISSING";
  if (match.status === "MULTIPLE_MATCHES") return "YELLOW";
  const matchedId = match.candidates[0].id;
  if (!currentId) return "GREEN_NEW";
  return currentId === matchedId ? "CONFIRMED" : "CONFLICT";
}

export function buildEntityMatchProposal(
  key: "builder" | "locality",
  label: string,
  proposedName: string,
  currentId: string | null,
  currentName: string | null,
  match: EntityMatchResult
): EntityMatchProposal {
  return { key, label, proposedName, currentId, currentName, match, classification: classifyEntityMatch(currentId, match) };
}
