import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (Approval Ready inline editing) -- regression guard for the
 * inline Edit control added to ReviewDataDetailsDialog's founder-facing
 * "Received data" and "Missing / needs review" sections. This repo has no
 * React Testing Library/jsdom environment (see EnrichmentProposalPanel.test.ts's
 * own note on this), so this checks the actual source structure rather than
 * attempting a fragile full render.
 */
const DIALOG_SOURCE = readFileSync(path.resolve(import.meta.dirname, "ReviewDataDetailsDialog.tsx"), "utf8");

describe("ReviewDataDetailsDialog -- Approval Ready inline editing (source inspection)", () => {
  it("gates the Edit affordance on isFieldManuallyEditable, matching the same protected-field exclusions Enrichment already uses", () => {
    expect(DIALOG_SOURCE).toContain("isFieldManuallyEditable(f.key)");
    expect(DIALOG_SOURCE).toContain('import { isFieldManuallyEditable } from "@/lib/enrichment/applyAcceptedField"');
  });

  it("never offers Edit for the synthetic 'possession' merged field (not a real registry key applyAcceptedField can write)", () => {
    expect(DIALOG_SOURCE).toContain('f.key !== "possession"');
  });

  it("Edit is only ever offered when onEditField is actually provided (non-Project records get no inline-edit affordance)", () => {
    expect(DIALOG_SOURCE).toContain("Boolean(onEditField)");
  });

  it("the inline editor calls the SAME onEditField callback the caller wires to acceptEnrichmentFieldAction -- no second mutation path defined in this file", () => {
    expect(DIALOG_SOURCE).not.toMatch(/prisma\./);
    expect(DIALOG_SOURCE).not.toMatch(/"use server"/);
    expect(DIALOG_SOURCE).toContain("onEditField!(fieldKey, value)");
  });

  it("closes the editor (clears editingKey) only on a successful save, leaving it open to show the error otherwise", () => {
    const idx = DIALOG_SOURCE.indexOf("onSave={async (fieldKey, value) => {");
    expect(idx).toBeGreaterThan(-1);
    const snippet = DIALOG_SOURCE.slice(idx, idx + 200);
    expect(snippet).toContain("if (result.ok) setEditingKey(null)");
  });

  it("both Received and Missing/Needs-Review rows render the inline editor when their own key is being edited", () => {
    const occurrences = DIALOG_SOURCE.split("<InlineFieldEditor").length - 1;
    expect(occurrences).toBe(2);
  });
});
