import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Founder Review Queue — Search + Agent Change Visibility, Part 4/6.
 * Source-inspection regression guard (no jsdom/RTL environment -- see
 * EnrichmentProposalPanel.test.ts's own note) for the read-only "Research
 * Changes" view.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ResearchChangesDialog.tsx"), "utf8");

describe("ResearchChangesDialog -- read-only audit view (Part 6)", () => {
  it("1. is a pure presentational component -- no server action, no database, no mutation call of any kind", () => {
    expect(DIALOG_SOURCE).not.toMatch(/"use server"/);
    expect(DIALOG_SOURCE).not.toMatch(/prisma\./);
    expect(DIALOG_SOURCE).not.toMatch(/Action\(/); // no acceptEnrichmentFieldAction/rejectEnrichmentFieldAction/etc. call
  });

  it("2. shows field, researched value, status, source, and timestamps for every finding", () => {
    expect(DIALOG_SOURCE).toContain("fieldLabel(completeness, f.fieldKey)");
    expect(DIALOG_SOURCE).toContain("f.proposedValue");
    expect(DIALOG_SOURCE).toContain("STATUS_BADGE[f.status]");
    expect(DIALOG_SOURCE).toContain("f.sourceUrl");
    expect(DIALOG_SOURCE).toContain("formatDateTime(f.proposedAt)");
    expect(DIALOG_SOURCE).toContain("f.decidedAt");
  });

  it("3. every ResearchFieldStatus has a distinct badge -- Accepted/Founder Edited/Rejected/Conflict/Pending are never collapsed into one generic 'changed' label", () => {
    expect(DIALOG_SOURCE).toContain('ACCEPTED: { tone: "positive", label: "Accepted"');
    expect(DIALOG_SOURCE).toContain('FOUNDER_EDITED: { tone: "positive", label: "Founder Edited"');
    expect(DIALOG_SOURCE).toContain('REJECTED: { tone: "negative", label: "Rejected"');
    expect(DIALOG_SOURCE).toContain('CONFLICT: { tone: "warning", label: "Conflict"');
    expect(DIALOG_SOURCE).toContain('PENDING: { tone: "muted", label: "Pending Review"');
  });

  it("4. shows the founder's own edited value distinctly from the original research-proposed value when they differ", () => {
    expect(DIALOG_SOURCE).toContain('f.status === "FOUNDER_EDITED"');
    expect(DIALOG_SOURCE).toContain("founderValue !== f.proposedValue");
  });

  it("5. surfaces the truthful provider label and last-research timestamp, never a hardcoded 'Claude' claim", () => {
    expect(DIALOG_SOURCE).toContain("activity.providerLabel");
    expect(DIALOG_SOURCE).not.toContain('"Claude + Chrome"'); // only ever comes from the activity prop, not a literal in this file
  });
});
