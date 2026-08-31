import type { DiscoveryStatus } from "./types";

/** Part I's three founder decisions. */
export type DiscoveryFounderAction = "INCLUDE" | "EXCLUDE" | "REVIEW";

export type FounderActionResult = { ok: true; next: DiscoveryStatus } | { ok: false; error: string };

/**
 * Applies ONE founder decision (Part I: ✓ Include / ✕ Exclude / Review) to a
 * candidate's current status. Deliberately tiny — this is a label change on
 * one IngestStagingRecord row, never a Project mutation, so most transitions
 * are unconditionally allowed (Exclude/Review always work, from any state,
 * matching Part I's "keep human control" instruction literally). The one
 * guard: a candidate the system has already flagged as matching an existing
 * Project (REJECTED_DUPLICATE) cannot be marked ready for enrichment without
 * the duplicate being resolved first — Part F's "never automatically put
 * uncertain/duplicate candidates into the enrichment pipeline".
 */
export function applyFounderDiscoveryAction(current: DiscoveryStatus, action: DiscoveryFounderAction): FounderActionResult {
  if (action === "EXCLUDE") return { ok: true, next: "EXCLUDED" };
  if (action === "REVIEW") return { ok: true, next: "NEEDS_REVIEW" };

  // INCLUDE
  if (current === "REJECTED_DUPLICATE") {
    return { ok: false, error: "This candidate matches an existing project. Resolve the duplicate before including it for enrichment." };
  }
  return { ok: true, next: "READY_FOR_ENRICHMENT" };
}
