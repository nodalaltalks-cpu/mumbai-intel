import type { DiscoveryStatus } from "./types";

/** Part I's three founder decisions. */
export type DiscoveryFounderAction = "INCLUDE" | "EXCLUDE" | "REVIEW";

export type FounderActionResult = { ok: true; next: DiscoveryStatus } | { ok: false; error: string };

/**
 * Applies ONE founder decision (Part I: ✓ Include / ✕ Exclude / Review) to a
 * candidate's current status. Deliberately tiny — this is a label change on
 * one IngestStagingRecord row, never a Project mutation, so most transitions
 * are unconditionally allowed (Exclude/Review always work, from any state,
 * matching Part I's "keep human control" instruction literally).
 *
 * For INCLUDE this is only the PRE-GUARD (may Include even be attempted from
 * this status?) — the actual Phase 40 outcome (create a real Project
 * staging record, or refuse with a duplicate/ambiguous-match reason) is
 * computed by the server action (lib/actions/discovery.ts), which only
 * proceeds when this guard says `ok`. Two states refuse Include outright:
 * REJECTED_DUPLICATE (already flagged as matching an existing project — the
 * duplicate must be resolved first, Part F) and PROJECT_STAGED (already
 * staged once — Including it again would create a second, redundant Project
 * staging record for the same candidate).
 */
export function applyFounderDiscoveryAction(current: DiscoveryStatus, action: DiscoveryFounderAction): FounderActionResult {
  if (action === "EXCLUDE") return { ok: true, next: "EXCLUDED" };
  if (action === "REVIEW") return { ok: true, next: "NEEDS_REVIEW" };

  // INCLUDE
  if (current === "REJECTED_DUPLICATE") {
    return { ok: false, error: "This candidate matches an existing project. Resolve the duplicate before including it for enrichment." };
  }
  if (current === "PROJECT_STAGED") {
    return { ok: false, error: "This candidate has already been staged as a Project. See the Project Review Queue." };
  }
  return { ok: true, next: "READY_FOR_ENRICHMENT" };
}
