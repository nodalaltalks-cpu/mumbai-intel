import { describe, expect, it } from "vitest";
import {
  formatPaymentPlanEntries,
  formatPaymentPlanEntry,
  mergeLegacyPaymentPlans,
  parsePaymentPlanEntries,
  parsePaymentPlanEntry,
} from "./paymentPlanFormat";

describe("parsePaymentPlanEntry / formatPaymentPlanEntry (round-trip)", () => {
  it("splits 'Type: Description' on the first separator", () => {
    expect(parsePaymentPlanEntry("Construction Linked Plan: 10:80:10, payable over 24 months")).toEqual({
      type: "Construction Linked Plan",
      description: "10:80:10, payable over 24 months",
    });
  });

  it("a string with no separator becomes description-only, never guessed as a type", () => {
    expect(parsePaymentPlanEntry("Just a note with no colon")).toEqual({ type: "", description: "Just a note with no colon" });
  });

  it("round-trips a full type+description entry exactly", () => {
    const entry = { type: "Flexi Payment Plan", description: "20% booking, 80% on possession" };
    expect(formatPaymentPlanEntry(entry)).toBe("Flexi Payment Plan: 20% booking, 80% on possession");
    expect(parsePaymentPlanEntry(formatPaymentPlanEntry(entry)!)).toEqual(entry);
  });

  it("a type-only entry formats without a trailing separator", () => {
    expect(formatPaymentPlanEntry({ type: "Down Payment Plan", description: "" })).toBe("Down Payment Plan");
  });

  it("a description-only entry formats as just the description", () => {
    expect(formatPaymentPlanEntry({ type: "", description: "5% discount on full upfront payment" })).toBe(
      "5% discount on full upfront payment"
    );
  });

  it("an entry with nothing in either half formats to null, never an empty string persisted", () => {
    expect(formatPaymentPlanEntry({ type: "  ", description: "" })).toBeNull();
  });

  it("trims whitespace on both halves", () => {
    expect(formatPaymentPlanEntry({ type: "  Plan A  ", description: "  desc  " })).toBe("Plan A: desc");
  });
});

describe("parsePaymentPlanEntries / formatPaymentPlanEntries (multi-plan lists)", () => {
  it("B/C. supports multiple plans, each with its own name + description", () => {
    const raw = ["Construction Linked Plan: 10:80:10, payable over 24 months", "Flexi Payment Plan: 20% booking, 80% on possession"];
    const entries = parsePaymentPlanEntries(raw);
    expect(entries).toEqual([
      { type: "Construction Linked Plan", description: "10:80:10, payable over 24 months" },
      { type: "Flexi Payment Plan", description: "20% booking, 80% on possession" },
    ]);
    expect(formatPaymentPlanEntries(entries)).toEqual(raw);
  });

  it("D. removing a plan (dropping it from the entries array) is reflected on format -- no orphaned entry left behind", () => {
    const entries = parsePaymentPlanEntries(["Plan A: Desc A", "Plan B: Desc B", "Plan C: Desc C"]);
    const afterRemovingPlanB = entries.filter((e) => e.type !== "Plan B");
    expect(formatPaymentPlanEntries(afterRemovingPlanB)).toEqual(["Plan A: Desc A", "Plan C: Desc C"]);
  });

  it("D. adding a plan appends a new entry without disturbing existing ones", () => {
    const entries = parsePaymentPlanEntries(["Plan A: Desc A"]);
    const afterAdding = [...entries, { type: "Plan B", description: "Desc B" }];
    expect(formatPaymentPlanEntries(afterAdding)).toEqual(["Plan A: Desc A", "Plan B: Desc B"]);
  });

  it("filters out empty entries when formatting, never persists a blank plan", () => {
    const entries = [{ type: "Plan A", description: "Desc A" }, { type: "", description: "" }];
    expect(formatPaymentPlanEntries(entries)).toEqual(["Plan A: Desc A"]);
  });

  it("an empty/undefined items list parses to an empty entries array", () => {
    expect(parsePaymentPlanEntries(undefined)).toEqual([]);
    expect(parsePaymentPlanEntries([])).toEqual([]);
  });
});

describe("mergeLegacyPaymentPlans (one consolidated founder field, legacy data never lost)", () => {
  it("uses the newer paymentPlans array as-is when it has real entries", () => {
    expect(mergeLegacyPaymentPlans(["Plan A: Desc A", "Plan B: Desc B"], "Legacy Type", "Legacy Description")).toEqual([
      "Plan A: Desc A",
      "Plan B: Desc B",
    ]);
  });

  it("falls back to the legacy paymentPlanType/paymentPlanDescription pair, folded into ONE entry, when paymentPlans is absent", () => {
    expect(mergeLegacyPaymentPlans(undefined, "Construction Linked", "10:80:10")).toEqual(["Construction Linked: 10:80:10"]);
  });

  it("falls back to legacy data when paymentPlans is an empty array", () => {
    expect(mergeLegacyPaymentPlans([], "Construction Linked", "10:80:10")).toEqual(["Construction Linked: 10:80:10"]);
  });

  it("legacy type alone (no description) still surfaces as one entry", () => {
    expect(mergeLegacyPaymentPlans(undefined, "Construction Linked", undefined)).toEqual(["Construction Linked"]);
  });

  it("legacy description alone (no type) still surfaces as one entry", () => {
    expect(mergeLegacyPaymentPlans(undefined, undefined, "10:80:10")).toEqual(["10:80:10"]);
  });

  it("returns an empty list when there is genuinely no payment plan data anywhere -- never fabricated", () => {
    expect(mergeLegacyPaymentPlans(undefined, undefined, undefined)).toEqual([]);
    expect(mergeLegacyPaymentPlans(null, null, null)).toEqual([]);
  });

  it("ignores non-string junk in a malformed paymentPlans array rather than crashing", () => {
    expect(mergeLegacyPaymentPlans([42, null, "Plan A: Desc A"], undefined, undefined)).toEqual(["Plan A: Desc A"]);
  });
});
