import { describe, expect, it } from "vitest";
import { shouldShowFloatingScrollbar } from "./StickyHorizontalScrollbar";

/**
 * Phase 68 — jsdom never computes real layout (scrollWidth/clientWidth are
 * always 0), so a rendered-component test of the sticky scrollbar's actual
 * scroll-sync behaviour would only be testing mocked values, not real
 * behaviour — this repo also has no React Testing Library/jsdom test
 * environment set up (every existing test targets a plain function under
 * vitest's "node" environment; see vitest.config.ts). The one genuinely
 * pure, meaningfully-testable piece of this component is the visibility
 * threshold, extracted and tested here.
 */
describe("shouldShowFloatingScrollbar", () => {
  it("shows the floating scrollbar when the table is wider than its visible container", () => {
    expect(shouldShowFloatingScrollbar(1200, 900)).toBe(true);
  });

  it("hides it when the table exactly fits its container", () => {
    expect(shouldShowFloatingScrollbar(900, 900)).toBe(false);
  });

  it("hides it when the table is narrower than its container", () => {
    expect(shouldShowFloatingScrollbar(700, 900)).toBe(false);
  });

  it("tolerates a 1px sub-pixel rounding difference without showing a scrollbar for content that effectively fits", () => {
    expect(shouldShowFloatingScrollbar(901, 900)).toBe(false);
  });

  it("shows it once the difference exceeds the sub-pixel tolerance", () => {
    expect(shouldShowFloatingScrollbar(902, 900)).toBe(true);
  });
});
