import { describe, expect, it } from "vitest";
import { buildTransactionReviewCompleteness } from "./transactionFieldRegistry";
import { buildProjectReviewCompleteness } from "./reviewFieldRegistry";
import type { TransactionImportPayload, ProjectImportPayload } from "./connectors/fileImport/types";

const PARTIAL_PAYLOAD: TransactionImportPayload = {
  localityId: "loc-1",
  type: "SALE",
  registrationDateIso: "2026-01-15T00:00:00.000Z",
  valueRupees: 25000000,
  carpetSqft: 950,
  dataSource: "MANUALLY_VERIFIED",
  sourceRef: "manual:test-1",
};

describe("buildTransactionReviewCompleteness — denominator (Part D/H: 8. correct denominator)", () => {
  it("total is exactly 16 (5 Transaction + 7 Property + 4 Source & Verification), computed not hardcoded", () => {
    const result = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD);
    const flat = result.groups.flatMap((g) => g.fields);
    expect(result.totalFields).toBe(flat.length);
    expect(result.totalFields).toBe(16);
    expect(result.totalFields).toBe(result.receivedCount + result.missingCount + result.needsReviewCount);
  });

  it("groups are exactly Transaction / Property / Source & Verification", () => {
    const result = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD);
    expect(result.groups.map((g) => g.label)).toEqual(["Transaction", "Property", "Source & Verification"]);
  });
});

describe("buildTransactionReviewCompleteness — CASE: partially populated transaction", () => {
  const result = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD, { localityName: "Andheri West" });
  const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));

  it("received fields the payload actually carries", () => {
    expect(byKey.get("locality")?.status).toBe("RECEIVED");
    expect(byKey.get("locality")?.value).toBe("Andheri West");
    expect(byKey.get("type")?.status).toBe("RECEIVED");
    expect(byKey.get("registrationDate")?.status).toBe("RECEIVED");
    expect(byKey.get("value")?.status).toBe("RECEIVED");
    expect(byKey.get("carpetSqft")?.status).toBe("RECEIVED");
    expect(byKey.get("sourceRef")?.status).toBe("RECEIVED");
    expect(byKey.get("dataSource")?.status).toBe("RECEIVED");
  });

  it("missing fields genuinely absent from this payload", () => {
    expect(byKey.get("project")?.status).toBe("MISSING");
    expect(byKey.get("bedrooms")?.status).toBe("MISSING");
    expect(byKey.get("tower")?.status).toBe("MISSING");
    expect(byKey.get("unitLabel")?.status).toBe("MISSING");
    // Structurally absent from TransactionImportPayload entirely today:
    expect(byKey.get("builtUpSqft")?.status).toBe("MISSING");
    expect(byKey.get("pricePerSqft")?.status).toBe("MISSING");
    expect(byKey.get("floor")?.status).toBe("MISSING");
    expect(byKey.get("confidence")?.status).toBe("MISSING");
    expect(byKey.get("sourceNote")?.status).toBe("MISSING");
    for (const f of result.groups.flatMap((g) => g.fields)) {
      if (f.status === "MISSING") expect(f.value).toBeNull();
    }
  });

  it("7 received / 9 missing for this exact fixture", () => {
    expect(result.receivedCount).toBe(7);
    expect(result.missingCount).toBe(9);
  });
});

describe("buildTransactionReviewCompleteness — CASE: fully populated transaction", () => {
  const fullPayload = {
    ...PARTIAL_PAYLOAD,
    projectId: "proj-1",
    bedrooms: 2,
    tower: "B",
    unitLabel: "B-1204",
    builtUpSqft: 1100,
    pricePerSqftRupees: 26315,
    floor: 12,
    confidence: "HIGH",
    sourceNote: "From registered deal sheet, verified by broker network.",
  } as unknown as TransactionImportPayload;

  it("every field is RECEIVED, nothing MISSING", () => {
    const result = buildTransactionReviewCompleteness(fullPayload, { localityName: "Andheri West", projectName: "Test Project" });
    expect(result.missingCount).toBe(0);
    expect(result.receivedCount).toBe(16);
  });
});

describe("buildTransactionReviewCompleteness — CASE: 0/false-valid values are not misclassified", () => {
  it("floor 0 (ground floor) is RECEIVED, not MISSING", () => {
    const payload = { ...PARTIAL_PAYLOAD, floor: 0 } as unknown as TransactionImportPayload;
    const result = buildTransactionReviewCompleteness(payload);
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("floor")?.status).toBe("RECEIVED");
    expect(byKey.get("floor")?.value).toBe("0");
  });

  it("bedrooms 0 (studio) is RECEIVED, not MISSING", () => {
    const payload = { ...PARTIAL_PAYLOAD, bedrooms: 0 };
    const result = buildTransactionReviewCompleteness(payload);
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("bedrooms")?.status).toBe("RECEIVED");
    expect(byKey.get("bedrooms")?.value).toBe("0");
  });
});

describe("Transaction registry does NOT include Project-only fields (Part D: no tagline/amenities/etc.)", () => {
  it("no field key or label resembles a Project-only concept", () => {
    const result = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD);
    const labels = result.groups.flatMap((g) => g.fields).map((f) => f.label.toLowerCase());
    for (const forbidden of ["tagline", "amenities", "description", "possession", "land area", "total towers", "meta", "cover image", "highlights", "brochure"]) {
      expect(labels.some((l) => l.includes(forbidden))).toBe(false);
    }
  });
});

describe("buildTransactionReviewCompleteness — Phase 19: possible-duplicate NEEDS_REVIEW", () => {
  it("flags sourceRef NEEDS_REVIEW only when a real possibleDuplicateNote is passed (never manufactured)", () => {
    const withoutNote = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD);
    const withoutByKey = new Map(withoutNote.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(withoutByKey.get("sourceRef")?.status).toBe("RECEIVED");
    expect(withoutNote.needsReviewCount).toBe(0);

    const withNote = buildTransactionReviewCompleteness(PARTIAL_PAYLOAD, {
      possibleDuplicateNote: "Registration number matches staging record abc123",
    });
    const withByKey = new Map(withNote.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(withByKey.get("sourceRef")?.status).toBe("NEEDS_REVIEW");
    expect(withByKey.get("sourceRef")?.reviewNote).toBe("Registration number matches staging record abc123");
    expect(withNote.needsReviewCount).toBe(1);
    // NEEDS_REVIEW is neither RECEIVED nor MISSING -- denominator math still holds.
    expect(withNote.totalFields).toBe(withNote.receivedCount + withNote.missingCount + withNote.needsReviewCount);
  });
});

describe("Project Review remains unaffected by the new Transaction registry", () => {
  it("buildProjectReviewCompleteness still returns the full 40-field Project registry, untouched", () => {
    const projectPayload: ProjectImportPayload = {
      name: "Test Project",
      status: "UNDER_CONSTRUCTION",
      category: "RESIDENTIAL",
      localityId: "loc-1",
      dataSource: "EXTERNAL_OPEN_DATA",
      sourceRef: "test:1",
    };
    const result = buildProjectReviewCompleteness(projectPayload);
    expect(result.totalFields).toBe(40);
  });
});
