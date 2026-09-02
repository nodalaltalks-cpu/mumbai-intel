/**
 * Phase 55 Part F — classifies a discovered page's raw status evidence into
 * the three founder-facing buckets the phase spec defines. Deliberately
 * conservative: CURRENT requires an explicit positive phrase; EXCLUDE
 * requires an explicit negative phrase; everything else — including a page
 * with NO evidence at all — is REVIEW, never silently assumed CURRENT
 * ("Do not infer current status merely because a page still exists.").
 */

export type GenericStatusBucket = "CURRENT" | "REVIEW" | "EXCLUDE";

export interface StatusClassificationResult {
  bucket: GenericStatusBucket;
  evidence: string;
}

/** Explicit CURRENT evidence — under construction / nearing possession / newly launched / EOI, matching Part F's include list. */
const CURRENT_PHRASES = [
  "under construction",
  "nearing possession",
  "possession expected",
  "possession by",
  "newly launched",
  "new launch",
  "now launched",
  "expression of interest",
  "eoi open",
];

/** Explicit REVIEW evidence — pre-launch / coming-soon, matching Part F's review list. */
const REVIEW_PHRASES = ["pre-launch", "prelaunch", "coming soon", "launching soon"];

/** Explicit EXCLUDE evidence — completed / sold-out / archived, matching Part F's exclude list. "ready to move"/"delivered"/"completed" are read as EXCLUDE only when paired with actual possession-handover language, never merely because the phrase "ready to move" appears as a marketing label. */
const HARD_EXCLUDE_PHRASES = ["sold out", "fully sold"];
const COMPLETION_EXCLUDE_PHRASES = ["possession handed over", "delivered", "completed"];

/**
 * Pure. `evidenceText` is the raw phrase `extractGenericProjectFacts` found
 * (or null if none) — this function never re-scans HTML itself, keeping
 * evidence-finding and evidence-classifying independently testable.
 */
export function classifyGenericProjectStatus(evidenceText: string | null, hasProjectLikeSignal: boolean): StatusClassificationResult {
  if (!hasProjectLikeSignal) {
    return { bucket: "EXCLUDE", evidence: "No project-shaped signal (JSON-LD/title) found on the page at all — not a real project page." };
  }
  if (!evidenceText) {
    return { bucket: "REVIEW", evidence: "No explicit status phrase found on the page — status cannot be safely established, needs founder review." };
  }

  const lower = evidenceText.toLowerCase();
  if (HARD_EXCLUDE_PHRASES.includes(lower) || COMPLETION_EXCLUDE_PHRASES.includes(lower)) {
    return { bucket: "EXCLUDE", evidence: `Page's own text: "${evidenceText}".` };
  }
  if (CURRENT_PHRASES.includes(lower)) {
    return { bucket: "CURRENT", evidence: `Page's own text: "${evidenceText}".` };
  }
  if (REVIEW_PHRASES.includes(lower)) {
    return { bucket: "REVIEW", evidence: `Page's own text: "${evidenceText}" — pre-launch/coming-soon, needs founder review before treating as current.` };
  }
  // "ready to move" alone (no completion-handover phrase alongside it) is a
  // common marketing label for available-for-sale RTM inventory, not
  // reliable proof the whole project is fully completed/archived (Part F:
  // "READY_TO_MOVE where clearly completed" is the exclude case, not RTM
  // generally) -- routed to REVIEW rather than guessed either way.
  return { bucket: "REVIEW", evidence: `Page's own text: "${evidenceText}" — ambiguous, needs founder review.` };
}
