import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Targeted fix (Reject option consistency) -- regression guard for the exact
 * rule the task requires: Reject is offered ONLY for a field with a genuine,
 * actionable proposed value (GREEN_NEW/YELLOW/CONFLICT), and is deliberately
 * ABSENT for CONFIRMED (the source agrees, nothing to decline) and MISSING
 * (no source value exists, nothing to decline) -- a meaningless Reject
 * button on those would let a founder "reject" a value that was never
 * actually proposed.
 *
 * This repo has no React Testing Library/jsdom environment (every existing
 * component test targets source structure or a plain function under
 * vitest's "node" environment -- see ProjectForm.test.ts's own note on
 * this), so this checks the actual JSX source for each classification
 * branch rather than attempting a fragile full render.
 */
const PANEL_SOURCE = readFileSync(path.resolve(import.meta.dirname, "EnrichmentProposalPanel.tsx"), "utf8");

function branchSource(classification: string): string {
  const marker = `field.classification === "${classification}"`;
  const start = PANEL_SOURCE.indexOf(marker);
  if (start === -1) throw new Error(`No branch found for classification "${classification}" -- check the marker text still matches the source.`);
  // Each branch is a single `{condition ? (<div>...</div>) : null}` block --
  // slice up to the next occurrence of the SAME "? (" -> ") : null}" pattern
  // boundary by grabbing a generous fixed window, which comfortably covers
  // one branch's JSX without spilling into the next given these branches'
  // real, current size.
  return PANEL_SOURCE.slice(start, start + 1800);
}

describe("EnrichmentProposalPanel -- Reject button consistency (source inspection)", () => {
  it("Q. GREEN_NEW (a genuine new-value proposal) offers Reject", () => {
    expect(branchSource("GREEN_NEW")).toContain('startReject(field.key)');
  });

  it("Q. YELLOW (a genuine lower-confidence proposal) offers Reject", () => {
    expect(branchSource("YELLOW")).toContain('startReject(field.key)');
  });

  it("Q. CONFLICT (a genuine disagreeing proposal) offers Reject", () => {
    expect(branchSource("CONFLICT")).toContain('startReject(field.key)');
  });

  it("R. CONFIRMED (the source agrees -- nothing to decline) never offers Reject", () => {
    expect(branchSource("CONFIRMED")).not.toContain('startReject(field.key)');
  });

  it("R. MISSING (no proposed value exists -- nothing to decline) never offers Reject", () => {
    expect(branchSource("MISSING")).not.toContain('startReject(field.key)');
  });
});
