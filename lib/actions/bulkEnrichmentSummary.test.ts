import { describe, expect, it } from "vitest";
import { summarizeBulkEnrichmentResult, formatBulkEnrichmentBatchSummary } from "./bulkEnrichmentSummary";
import type { BulkEnrichmentResult, BulkEnrichmentProjectResult } from "./bulkEnrichment";

function result(status: BulkEnrichmentProjectResult["status"], conflict = 0): BulkEnrichmentProjectResult {
  return {
    projectName: "X",
    status,
    durationMs: 100,
    fieldsFound: 0,
    greenNew: 0,
    confirmed: 0,
    yellow: 0,
    conflict,
    missing: 0,
  };
}

describe("summarizeBulkEnrichmentResult (Phase 46 Part G)", () => {
  it("15/16. tallies each status independently across a mixed batch, matching the Part G worked example shape", () => {
    const batch: BulkEnrichmentResult = {
      totalDurationMs: 5000,
      results: [
        result("SUCCESS"),
        result("SUCCESS"),
        result("SUCCESS"),
        result("SUCCESS"),
        result("SUCCESS"),
        result("SUCCESS"),
        result("SUCCESS", 3), // conflict-heavy
        result("SUCCESS"),
        result("SOURCE_UNAVAILABLE"),
        result("NO_SOURCE"),
      ],
    };
    const summary = summarizeBulkEnrichmentResult(batch);
    expect(summary.totalProjects).toBe(10);
    expect(summary.enrichedCount).toBe(8);
    expect(summary.sourceUnavailableCount).toBe(1);
    expect(summary.noSourceCount).toBe(1);
    expect(summary.conflictHeavyCount).toBe(1);
    expect(summary.totalConflicts).toBe(3);
    expect(summary.totalDurationMs).toBe(5000);
  });

  it("counts INCLUDE_FAILED and ERROR and NO_NEW_INFO distinctly", () => {
    const batch: BulkEnrichmentResult = {
      totalDurationMs: 1,
      results: [result("INCLUDE_FAILED"), result("ERROR"), result("NO_NEW_INFO")],
    };
    const summary = summarizeBulkEnrichmentResult(batch);
    expect(summary.includeFailedCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.noNewInfoCount).toBe(1);
  });

  it("an empty batch summarizes to all zeros, never divides by zero or throws", () => {
    const summary = summarizeBulkEnrichmentResult({ totalDurationMs: 0, results: [] });
    expect(summary.totalProjects).toBe(0);
    expect(summary.enrichedCount).toBe(0);
  });

  it("formatBulkEnrichmentBatchSummary renders the Part G example format, omitting zero-count lines", () => {
    const summary = summarizeBulkEnrichmentResult({
      totalDurationMs: 1,
      results: [result("SUCCESS"), result("SUCCESS"), result("SUCCESS"), result("SUCCESS", 2), result("SOURCE_UNAVAILABLE")],
    });
    const text = formatBulkEnrichmentBatchSummary(summary, "Andheri West — Batch 001");
    expect(text).toBe("Andheri West — Batch 001\n5 Projects\n4 enriched\n1 source unavailable\n1 conflict-heavy");
  });
});
