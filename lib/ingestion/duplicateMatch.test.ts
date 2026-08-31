import { describe, expect, it } from "vitest";
import { findAllPossibleBuilderMatches, findAllPossibleLocalityMatches, findPossibleDuplicateTransaction } from "./duplicateMatch";

describe("findPossibleDuplicateTransaction (Phase 19)", () => {
  it("returns null when the candidate has no real registration number (never fires off the synthetic content-hash)", () => {
    const result = findPossibleDuplicateTransaction([{ id: "stg-1", sourceRef: "csv-upload-transactions:abc123" }], {});
    expect(result).toBeNull();
  });

  it("flags an exact registration-number match against a pending candidate with confidence 1", () => {
    const result = findPossibleDuplicateTransaction(
      [{ id: "stg-1", sourceRef: "IGR-2026-000123" }],
      { registrationNumber: "IGR-2026-000123" }
    );
    expect(result).toEqual({ existingId: "stg-1", confidence: 1, reason: "registration_number" });
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const result = findPossibleDuplicateTransaction(
      [{ id: "stg-1", sourceRef: "  igr-2026-000123  " }],
      { registrationNumber: "IGR-2026-000123" }
    );
    expect(result?.existingId).toBe("stg-1");
  });

  it("returns null when no pending candidate shares the registration number", () => {
    const result = findPossibleDuplicateTransaction(
      [{ id: "stg-1", sourceRef: "IGR-2026-999999" }],
      { registrationNumber: "IGR-2026-000123" }
    );
    expect(result).toBeNull();
  });

  it("ignores pending candidates whose sourceRef is a synthetic content hash, not a real number, unless it happens to collide", () => {
    const result = findPossibleDuplicateTransaction(
      [{ id: "stg-1", sourceRef: null }],
      { registrationNumber: "IGR-2026-000123" }
    );
    expect(result).toBeNull();
  });
});

describe("findAllPossibleBuilderMatches (Phase 33 — same fuzzy matcher as findPossibleDuplicateBuilder, returns every candidate above threshold)", () => {
  it("returns a single candidate when only one builder is a plausible match", () => {
    const result = findAllPossibleBuilderMatches(
      [
        { id: "b-1", name: "Godrej Properties", reraNumber: null },
        { id: "b-2", name: "Lodha Group", reraNumber: null },
      ],
      "Godrej Properties Ltd."
    );
    expect(result).toHaveLength(1);
    expect(result[0].existingId).toBe("b-1");
  });

  it("returns multiple candidates when the proposed name is ambiguous between two real builders, neither an exact match", () => {
    const result = findAllPossibleBuilderMatches(
      [
        { id: "b-1", name: "Adani Realty Mumbai", reraNumber: null },
        { id: "b-2", name: "Adani Realty Pune", reraNumber: null },
      ],
      "Adani Realty"
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.map((r) => r.existingId).sort()).toEqual(["b-1", "b-2"]);
  });

  it("returns an empty array when nothing meets the threshold", () => {
    const result = findAllPossibleBuilderMatches([{ id: "b-1", name: "Lodha Group", reraNumber: null }], "Totally Unrelated Developer XYZ");
    expect(result).toHaveLength(0);
  });

  it("sorts candidates by confidence, highest first", () => {
    const result = findAllPossibleBuilderMatches(
      [
        { id: "b-1", name: "Adani Realty & RC Group", reraNumber: null },
        { id: "b-2", name: "Adani Realty", reraNumber: null },
      ],
      "Adani Realty"
    );
    expect(result[0].existingId).toBe("b-2"); // exact word-set match scores 1.0, ranks first
  });
});

describe("findAllPossibleLocalityMatches (Phase 33)", () => {
  it("returns a single candidate for an unambiguous fuzzy match", () => {
    const result = findAllPossibleLocalityMatches(
      [
        { id: "l-1", name: "Andheri West" },
        { id: "l-2", name: "Bandra West" },
      ],
      "andheri west"
    );
    expect(result).toHaveLength(1);
    expect(result[0].existingId).toBe("l-1");
  });

  it("returns an empty array when no locality is a plausible match", () => {
    const result = findAllPossibleLocalityMatches([{ id: "l-1", name: "Andheri West" }], "Some Other City Entirely");
    expect(result).toHaveLength(0);
  });
});
