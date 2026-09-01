/**
 * MahaRERA -- SECONDARY verification source (Phase 52 Part E). Never the
 * primary discovery engine: OFFICIAL_DEVELOPER establishes the current
 * marketing/project identity; MahaRERA independently corroborates the
 * regulatory record for that same real project. Nothing here ever creates,
 * approves, or renames a Project -- see matchMahaRera.ts's own doc comment.
 */

/** Part H's five classification states -- exactly these five, nothing collapsed or invented. */
export type MahaRERAMatchClassification = "EXACT_MATCH" | "STRONG_MATCH" | "AMBIGUOUS_MATCH" | "NO_MATCH" | "UNAVAILABLE";

/** One registered project as MahaRERA itself would publish it -- a regulatory record, deliberately separate from this codebase's own Project shape (Part F: never auto-renamed onto the official project). */
export interface MahaRERARecord {
  reraNumber: string;
  registeredProjectName: string;
  promoterName: string;
  /** Registered location text (district/taluka/locality), as MahaRERA itself records it -- often coarser or differently-worded than this codebase's own Locality names. */
  location?: string;
  registrationStatus?: string;
  registrationDate?: string;
  proposedCompletionDate?: string;
}

/**
 * What we already know about ONE project from its OFFICIAL_DEVELOPER source,
 * fed into the matcher as the thing MahaRERA evidence is being checked
 * against. `officialReraNumber` -- when the developer's own page already
 * published one (Part G's strongest signal: an exact RERA-number match) --
 * takes priority over every other signal.
 */
export interface MahaRERAMatchInput {
  officialProjectName: string;
  officialDeveloperName: string;
  /** The resolved Mumbai Locality name (Part L), when known. */
  officialLocalityName?: string | null;
  officialReraNumber?: string | null;
}

export interface MahaRERAMatchResult {
  classification: MahaRERAMatchClassification;
  /** Set only for EXACT_MATCH/STRONG_MATCH -- the single record identified as the same real project. */
  matchedRecord?: MahaRERARecord;
  /** Set only for AMBIGUOUS_MATCH -- every record that could plausibly be the same project, so a human picks rather than the system guessing. */
  candidateRecords?: MahaRERARecord[];
  reason: string;
}
