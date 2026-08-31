import { findPossibleDuplicateProject, type ExistingProjectCandidate } from "../duplicateMatch";
import type { DiscoveryDuplicateMatch, DiscoveryDuplicateStatus } from "./types";

/** Above this similarity, a name_locality match is confident enough to call a CLEAR alias rather than merely ambiguous — e.g. "Godrej Sky Shore" vs "Godrej Sky Shore, Versova" (0.75: 3 shared words / 4 union words). */
const CLEAR_ALIAS_THRESHOLD = 0.75;

function compactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface DiscoveryDuplicateResult {
  duplicateStatus: DiscoveryDuplicateStatus;
  match: DiscoveryDuplicateMatch | null;
}

/**
 * Buckets a discovery candidate's likely-duplicate signal into the four
 * founder-facing states Phase 39 Part F asks for, reusing the EXISTING
 * Project duplicate matcher (lib/ingestion/duplicateMatch.ts's
 * findPossibleDuplicateProject) as the sole authority on "is there a
 * matching existing Project" — this function only labels its output, never
 * re-implements matching itself.
 *
 * One narrow addition layered on top, never instead of, that reused matcher:
 * a same-locality "compact name" (letters/digits only, no spaces) exact-match
 * check. This catches a real, common spelling variant the existing
 * word-Jaccard matcher misses by design — "Godrej Sky Shore" vs "Godrej
 * Skyshore" tokenize to entirely different word sets ({godrej,sky,shore} vs
 * {godrej,skyshore}), so the reused matcher alone returns NO match for that
 * exact pair (Part F's own worked example). This only ever fires when the
 * reused matcher found nothing — it never overrides or second-guesses a
 * result the reused matcher already produced.
 */
export function classifyDiscoveryDuplicate(
  existingProjects: ExistingProjectCandidate[],
  candidate: { name: string; localityId: string; reraNumber?: string }
): DiscoveryDuplicateResult {
  const existingMatch = findPossibleDuplicateProject(existingProjects, candidate);

  if (existingMatch) {
    const existing = existingProjects.find((p) => p.id === existingMatch.existingId);
    const match: DiscoveryDuplicateMatch = {
      existingId: existingMatch.existingId,
      existingName: existing?.name ?? "",
      confidence: existingMatch.confidence,
      reason: existingMatch.reason,
    };
    if (existingMatch.reason === "rera_number") return { duplicateStatus: "EXACT", match };
    if (existingMatch.confidence >= CLEAR_ALIAS_THRESHOLD) return { duplicateStatus: "CLEAR_ALIAS", match };
    return { duplicateStatus: "AMBIGUOUS", match };
  }

  const candidateCompact = compactName(candidate.name);
  const compactMatch = existingProjects.find(
    (p) => p.localityId === candidate.localityId && compactName(p.name) === candidateCompact
  );
  if (compactMatch) {
    return {
      duplicateStatus: "CLEAR_ALIAS",
      match: { existingId: compactMatch.id, existingName: compactMatch.name, confidence: 1, reason: "compact_name_alias" },
    };
  }

  return { duplicateStatus: "NO_MATCH", match: null };
}
