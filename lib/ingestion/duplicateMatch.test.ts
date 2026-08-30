import { describe, expect, it } from "vitest";
import { findPossibleDuplicateTransaction } from "./duplicateMatch";

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
