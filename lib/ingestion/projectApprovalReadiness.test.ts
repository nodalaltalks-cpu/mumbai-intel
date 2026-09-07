import { describe, expect, it } from "vitest";
import { computeApprovalReadiness } from "./projectApprovalReadiness";
import { buildProjectReviewCompleteness } from "./reviewFieldRegistry";
import type { ProjectImportPayload } from "./connectors/fileImport/types";

const ADANI_PAYLOAD: ProjectImportPayload = {
  name: "Adani Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "cmteri8u70000zchqy5as7ydl",
  reraNumber: "P51800047539",
  description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 6.9 Crore(s)",
  developerGroup: "Adani Realty & RC Group",
  priceMinRupees: 44608000,
  possessionDateIso: "2028-10-01T00:00:00.000Z",
};

// A more fully-filled payload for the "fully complete" test -- still real
// ProjectImportPayload fields, no fabricated/unused ones.
const FULLY_FILLED_PAYLOAD: ProjectImportPayload = {
  ...ADANI_PAYLOAD,
  builderId: "bldr-1",
  address: "off, Fun Republic, New Link road, Andheri west",
  launchDateIso: "2027-01-01T00:00:00.000Z",
  totalUnits: 300,
  totalTowers: 2,
};

describe("computeApprovalReadiness (Phase 34 Part B/C — reuses the EXISTING completeness computation, no new calculator)", () => {
  it("1. a fully complete project (no NEEDS_REVIEW fields at all) is READY", () => {
    const completeness = buildProjectReviewCompleteness(FULLY_FILLED_PAYLOAD, {
      localityName: "Andheri West",
    });
    const result = computeApprovalReadiness(completeness);
    expect(result.status).toBe("READY");
    expect(result.neededFieldLabels).toHaveLength(0);
  });

  it("2. a partially complete project with plenty of MISSING (but zero NEEDS_REVIEW) fields is still READY -- missing fields never block readiness", () => {
    const completeness = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    expect(completeness.missingCount).toBeGreaterThan(0); // sanity check this payload really is incomplete
    const result = computeApprovalReadiness(completeness);
    expect(result.status).toBe("READY");
    expect(result.missingFieldLabels.length).toBeGreaterThan(0);
  });

  it("3. a MISSING required-looking field (e.g. RERA number) never blocks readiness on its own", () => {
    const { reraNumber: _drop, ...withoutRera } = ADANI_PAYLOAD;
    void _drop;
    const completeness = buildProjectReviewCompleteness(withoutRera as ProjectImportPayload, { localityName: "Andheri West" });
    const result = computeApprovalReadiness(completeness);
    expect(result.missingFieldLabels).toContain("RERA number");
    expect(result.status).toBe("READY");
  });

  it("4. a MISSING optional field (e.g. brochure) never blocks readiness", () => {
    const completeness = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    const result = computeApprovalReadiness(completeness);
    expect(result.missingFieldLabels).toContain("Brochure");
    expect(result.status).toBe("READY");
  });

  it("5. a genuine YELLOW/NEEDS_REVIEW field (an unresolved possible-duplicate name conflict) blocks readiness", () => {
    const completeness = buildProjectReviewCompleteness(ADANI_PAYLOAD, {
      localityName: "Andheri West",
      matched: { name: "A Completely Different Project Name", status: "UNDER_CONSTRUCTION", reraNumber: null },
    });
    const result = computeApprovalReadiness(completeness);
    expect(result.neededFieldLabels).toContain("Name");
    expect(result.status).toBe("NEEDS_ATTENTION");
  });

  it("6/7. approval-ready vs non-approval-ready are driven purely by the needs-review count, not an arbitrary percentage", () => {
    const readyCompleteness = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    expect(computeApprovalReadiness(readyCompleteness).status).toBe("READY");

    const notReadyCompleteness = buildProjectReviewCompleteness(ADANI_PAYLOAD, {
      localityName: "Andheri West",
      matched: { name: "Adani Linkbay Residences", status: "READY_TO_MOVE", reraNumber: "P51800047539" }, // status differs -> NEEDS_REVIEW
    });
    expect(computeApprovalReadiness(notReadyCompleteness).status).toBe("NEEDS_ATTENTION");
  });

  it("8. the underlying 38-field total/received/missing counts are untouched -- this function only reads them, never recomputes", () => {
    const completeness = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    const before = { total: completeness.totalFields, received: completeness.receivedCount, missing: completeness.missingCount };
    computeApprovalReadiness(completeness);
    expect(completeness.totalFields).toBe(before.total);
    expect(completeness.receivedCount).toBe(before.received);
    expect(completeness.missingCount).toBe(before.missing);
    expect(completeness.totalFields).toBe(38);
  });

  it("10. reflects Locality resolution the same way (locality already required on every staged payload, but confirms the mechanism)", () => {
    const completeness = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    expect(completeness.groups.flatMap((g) => g.fields).find((f) => f.key === "locality")?.status).toBe("RECEIVED");
  });

  it("11. reflects an enrichment-accepted field: a previously-missing field (address) becomes RECEIVED", () => {
    const before = buildProjectReviewCompleteness(ADANI_PAYLOAD, { localityName: "Andheri West" });
    expect(computeApprovalReadiness(before).missingFieldLabels).toContain("Address");

    const after = buildProjectReviewCompleteness(
      { ...ADANI_PAYLOAD, address: "off, Fun Republic, New Link road, Andheri west" },
      { localityName: "Andheri West" }
    );
    expect(computeApprovalReadiness(after).missingFieldLabels).not.toContain("Address");
  });
});
