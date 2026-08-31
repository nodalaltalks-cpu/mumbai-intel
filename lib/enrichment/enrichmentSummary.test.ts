import { describe, expect, it } from "vitest";
import { buildEnrichmentSummary, deriveEnrichmentBadge, readEnrichmentSummary, withFieldTouched } from "./enrichmentSummary";
import type { EnrichmentField } from "./types";

function field(key: string, classification: EnrichmentField["classification"]): EnrichmentField {
  return {
    key,
    label: key,
    group: "General",
    currentValue: "old",
    proposedValue: "new",
    sourceUrl: "https://example.com/project",
    sourceType: "OFFICIAL_DEVELOPER",
    confidence: "High",
    classification,
    reason: "",
  };
}

describe("buildEnrichmentSummary (Phase 46 Part B/D)", () => {
  it("1. NOT_RUN is derived from absence, never stored explicitly -- readEnrichmentSummary(undefined payload) is null", () => {
    expect(readEnrichmentSummary({})).toBeNull();
    expect(readEnrichmentSummary(undefined)).toBeNull();
  });

  it("2/6. READY status with a real GREEN_NEW/YELLOW/CONFLICT mix populates `outstanding`, excluding CONFIRMED/MISSING", () => {
    const summary = buildEnrichmentSummary("READY", [
      field("a", "GREEN_NEW"),
      field("b", "YELLOW"),
      field("c", "CONFLICT"),
      field("d", "CONFIRMED"),
      field("e", "MISSING"),
    ]);
    expect(summary.status).toBe("READY");
    expect(summary.outstanding).toEqual({ a: "GREEN_NEW", b: "YELLOW", c: "CONFLICT" });
    expect(summary.sourceUrl).toBe("https://example.com/project");
    expect(typeof summary.lastRunAt).toBe("string");
  });

  it("3. NO_NEW_INFO status with no fields -- outstanding stays empty", () => {
    const summary = buildEnrichmentSummary("NO_NEW_INFO", []);
    expect(summary.status).toBe("NO_NEW_INFO");
    expect(summary.outstanding).toEqual({});
  });

  it("4. NO_SOURCE and SOURCE_UNAVAILABLE and ERROR are distinct statuses, never conflated with each other or with NO_NEW_INFO", () => {
    expect(buildEnrichmentSummary("NO_SOURCE", undefined).status).toBe("NO_SOURCE");
    expect(buildEnrichmentSummary("SOURCE_UNAVAILABLE", undefined).status).toBe("SOURCE_UNAVAILABLE");
    expect(buildEnrichmentSummary("ERROR", undefined).status).toBe("ERROR");
  });

  it("deriveEnrichmentBadge counts proposed/conflict correctly from a persisted summary", () => {
    const payload = { enrichmentSummary: buildEnrichmentSummary("READY", [field("a", "GREEN_NEW"), field("b", "CONFLICT"), field("c", "CONFLICT")]) };
    const badge = deriveEnrichmentBadge(payload);
    expect(badge.status).toBe("READY");
    expect(badge.proposedCount).toBe(3);
    expect(badge.conflictCount).toBe(2);
  });

  it("deriveEnrichmentBadge on a payload with no summary at all returns NOT_RUN with zero counts", () => {
    const badge = deriveEnrichmentBadge({ name: "Some Project" });
    expect(badge).toEqual({ status: "NOT_RUN", proposedCount: 0, conflictCount: 0, lastRunAt: null });
  });

  it("7/8/9. withFieldTouched removes exactly one outstanding field, leaving siblings and the rest of the payload untouched (Accept/Edit+Accept path)", () => {
    const payload = { name: "X", enrichmentSummary: buildEnrichmentSummary("READY", [field("a", "GREEN_NEW"), field("b", "CONFLICT")]) };
    const result = withFieldTouched(payload, "a");
    expect(readEnrichmentSummary(result)!.outstanding).toEqual({ b: "CONFLICT" });
    expect(result.name).toBe("X");
  });

  it("9. withFieldTouched on Undo -- same mechanism, field key removed regardless of which action touched it", () => {
    const payload = { enrichmentSummary: buildEnrichmentSummary("READY", [field("a", "YELLOW")]) };
    const result = withFieldTouched(payload, "a");
    expect(readEnrichmentSummary(result)!.outstanding).toEqual({});
  });

  it("withFieldTouched is a no-op when the field isn't (or is no longer) outstanding -- never errors, never invents an entry", () => {
    const payload = { enrichmentSummary: buildEnrichmentSummary("READY", [field("a", "GREEN_NEW")]) };
    const result = withFieldTouched(payload, "not-a-real-key");
    expect(result).toBe(payload); // same reference -- genuinely untouched
  });

  it("withFieldTouched is a no-op when there is no summary at all yet", () => {
    const payload = { name: "X" };
    const result = withFieldTouched(payload, "anything");
    expect(result).toBe(payload);
  });
});
