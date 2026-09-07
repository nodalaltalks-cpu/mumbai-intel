import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (Approval Ready <-> Enrich consistency) -- a fresh Enrich run
 * that finds no fresh CONFLICT/YELLOW/GREEN_NEW proposal (NO_NEW_INFO) still
 * computes the full field list (classifyProjectEnrichment classifies every
 * registry field, MISSING included -- see computeEnrichmentResult). Before
 * this fix, EnrichmentDialog only ever rendered EnrichmentProposalPanel when
 * `status === "SUCCESS"`, so a genuinely MISSING field -- and its Edit/View
 * History controls -- became completely unreachable the moment every
 * outstanding conflict had already been resolved. This repo has no React
 * Testing Library/jsdom environment (see EnrichmentProposalPanel.test.ts's
 * own note on this), so this checks the actual source structure.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "EnrichmentDialog.tsx"), "utf8");

describe("EnrichmentDialog -- field panel stays reachable on NO_NEW_INFO (source inspection)", () => {
  it("renders EnrichmentProposalPanel whenever fields exist, not only when status === SUCCESS", () => {
    const idx = DIALOG_SOURCE.indexOf("fields && fields.length > 0");
    expect(idx).toBeGreaterThan(-1);
    // The gate must not also require status === "SUCCESS" on the same condition.
    const conditionLine = DIALOG_SOURCE.slice(DIALOG_SOURCE.lastIndexOf("\n", idx), idx + 40);
    expect(conditionLine).not.toContain('status === "SUCCESS" &&');
  });

  it("still shows the founder a distinct, softer status line for a NO_NEW_INFO run (not the same green 'ready' copy as a genuine SUCCESS)", () => {
    const idx = DIALOG_SOURCE.indexOf("fields && fields.length > 0");
    const branch = DIALOG_SOURCE.slice(idx, idx + 1000);
    expect(branch).toContain('status === "SUCCESS" ? "Enrichment results ready." : STATUS_COPY.NO_NEW_INFO');
  });

  it("NO_SOURCE / SOURCE_UNAVAILABLE (which never carry a fields array) still fall through to the existing Try again branch", () => {
    expect(DIALOG_SOURCE).toContain('status === "NO_SOURCE" || status === "SOURCE_UNAVAILABLE" || status === "NO_NEW_INFO"');
  });
});
