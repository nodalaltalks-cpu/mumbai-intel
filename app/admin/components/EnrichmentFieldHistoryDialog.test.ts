import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (History -- exact timestamp + Founder Edited label) -- an
 * accept event the founder typed a genuinely different value into reads as
 * "Founder Edited" in the history badge, distinct from a plain "Accepted"/
 * "Edited & Accepted" of the source's own proposal. This repo has no React
 * Testing Library/jsdom environment (see EnrichmentProposalPanel.test.ts's
 * own note), so this checks the actual source.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "EnrichmentFieldHistoryDialog.tsx"), "utf8");

describe("EnrichmentFieldHistoryDialog -- Founder Edited label + real persisted timestamp (source inspection)", () => {
  it("labels a founderEdited accept event 'Founder Edited', not the generic ACTION_LABEL text", () => {
    expect(DIALOG_SOURCE).toContain('entry.after?.founderEdited ? "Founder Edited" : ACTION_LABEL[entry.action]');
  });

  it("renders the timestamp via formatDateTime(entry.at) -- the real persisted AuditLog timestamp, never a client-generated one", () => {
    expect(DIALOG_SOURCE).toContain("formatDateTime(entry.at)");
    expect(DIALOG_SOURCE).not.toMatch(/new Date\(\)\.toISOString\(\)|Date\.now\(\)/);
  });
});
