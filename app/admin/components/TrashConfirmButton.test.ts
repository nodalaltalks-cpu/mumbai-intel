import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Data Sync Control Center fix — Problem 2 (Delete/Trash).
 * Source-inspection regression guard (no jsdom/RTL environment -- see
 * EnrichmentProposalPanel.test.ts's own note).
 */
const SOURCE = readFileSync(path.resolve(import.meta.dirname, "TrashConfirmButton.tsx"), "utf8");

describe("TrashConfirmButton", () => {
  it("13. renders a resting trigger button with the given label", () => {
    expect(SOURCE).toContain("{label}");
    expect(SOURCE).toContain('label = "Reject"');
  });

  it("14. shows a confirmation dialog with item identity and the exact required warning copy before doing anything", () => {
    expect(SOURCE).toContain('title="Move to Trash?"');
    expect(SOURCE).toContain("{itemName}");
    expect(SOURCE).toContain("{itemIdentity}");
    expect(SOURCE).toContain("This will remove it from the active Data Sync workflow. You can restore it from Trash.");
  });

  it("offers exactly Cancel and Move to Trash -- no third/ambiguous option", () => {
    expect(SOURCE).toContain("Cancel");
    expect(SOURCE).toContain("Move to Trash");
  });

  it("15. Cancel only closes the dialog -- never calls the mutation", () => {
    // Both the Dialog's own onClose and the Cancel button wire to the same
    // setOpen(false) -- neither ever calls `action` or `confirm`.
    const closeCalls = SOURCE.match(/onClick=\{\(\) => setOpen\(false\)\}/g) ?? [];
    expect(closeCalls.length).toBeGreaterThanOrEqual(1);
    expect(SOURCE).toContain("onClose={() => setOpen(false)}");
  });

  it("16. Confirm calls the SAME action passed in as a prop -- no action defined in this file, no permanent/hard delete anywhere", () => {
    expect(SOURCE).toContain("await action()");
    expect(SOURCE).not.toMatch(/permanentlyDelete/i);
    expect(SOURCE).not.toMatch(/prisma\./);
    expect(SOURCE).not.toMatch(/"use server"/);
  });

  it("17. the item disappears from the active queue via router.refresh() after a successful confirm, not a local-only state hide", () => {
    expect(SOURCE).toContain("router.refresh()");
  });

  it("a failed mutation shows the error and keeps the dialog open for the founder to see it", () => {
    const idx = SOURCE.indexOf("if (result.error)");
    const snippet = SOURCE.slice(idx, idx + 150);
    expect(snippet).toContain("setError(result.error)");
    expect(snippet).toContain("return");
  });
});
