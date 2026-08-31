import { describe, expect, it } from "vitest";
import { applyFounderDiscoveryAction } from "./statusTransitions";
import type { DiscoveryStatus } from "./types";

const ALL_STATUSES: DiscoveryStatus[] = [
  "DISCOVERED",
  "SOURCE_FOUND",
  "READY_FOR_ENRICHMENT",
  "PROJECT_STAGED",
  "ENRICHED",
  "NEEDS_REVIEW",
  "REJECTED_DUPLICATE",
  "EXCLUDED",
];

describe("applyFounderDiscoveryAction (Phase 39 Part I)", () => {
  it("11. EXCLUDE always succeeds, from any status", () => {
    for (const status of ALL_STATUSES) {
      expect(applyFounderDiscoveryAction(status, "EXCLUDE")).toEqual({ ok: true, next: "EXCLUDED" });
    }
  });

  it("12. REVIEW always succeeds, from any status", () => {
    for (const status of ALL_STATUSES) {
      expect(applyFounderDiscoveryAction(status, "REVIEW")).toEqual({ ok: true, next: "NEEDS_REVIEW" });
    }
  });

  it("13. INCLUDE succeeds from DISCOVERED/SOURCE_FOUND/NEEDS_REVIEW, moving straight to READY_FOR_ENRICHMENT", () => {
    expect(applyFounderDiscoveryAction("DISCOVERED", "INCLUDE")).toEqual({ ok: true, next: "READY_FOR_ENRICHMENT" });
    expect(applyFounderDiscoveryAction("SOURCE_FOUND", "INCLUDE")).toEqual({ ok: true, next: "READY_FOR_ENRICHMENT" });
    expect(applyFounderDiscoveryAction("NEEDS_REVIEW", "INCLUDE")).toEqual({ ok: true, next: "READY_FOR_ENRICHMENT" });
  });

  it("14. INCLUDE is refused for a REJECTED_DUPLICATE candidate — never silently include something matching an existing project", () => {
    const result = applyFounderDiscoveryAction("REJECTED_DUPLICATE", "INCLUDE");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("existing project");
  });

  it("15. INCLUDE is refused for an already-PROJECT_STAGED candidate — never stage the same candidate twice (Phase 40)", () => {
    const result = applyFounderDiscoveryAction("PROJECT_STAGED", "INCLUDE");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already been staged");
  });
});
