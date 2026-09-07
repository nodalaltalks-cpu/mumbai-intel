import { describe, expect, it } from "vitest";
import { buildEnrichmentConflicts, buildFounderReviewSummary } from "./founderReviewFields";
import { buildBuilderReviewCompleteness, buildProjectReviewCompleteness } from "./reviewFieldRegistry";
import type { ProjectImportPayload } from "./connectors/fileImport/types";

const LINKBAY_PAYLOAD: ProjectImportPayload = {
  name: "Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-1",
  reraNumber: "P51800047539",
  priceMinRupees: 44600000,
};

describe("buildFounderReviewSummary", () => {
  it("returns null for a non-Project completeness object (e.g. Builder) — leaves those unfiltered", () => {
    const builderCompleteness = buildBuilderReviewCompleteness({
      name: "Godrej Properties Ltd.",
      dataSource: "EXTERNAL_OPEN_DATA",
      sourceRef: "manual:test",
    });
    expect(buildFounderReviewSummary(builderCompleteness)).toBeNull();
  });

  it("only surfaces the 16 founder-relevant fields, never the technical/deprecated ones", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" });
    const summary = buildFounderReviewSummary(completeness)!;
    expect(summary.totalFields).toBe(16);
    const keys = summary.fields.map((f) => f.key);
    expect(keys).toEqual([
      "name",
      "developerGroup",
      "developerWebsiteUrl",
      "locality",
      "microMarket",
      "status",
      "category",
      "address",
      "priceMin",
      "reraNumber",
      "possession",
      "description",
      "highlights",
      "amenities",
      "coverImage",
      "brochure",
    ]);
    // never leaks a technical/deprecated field into the founder set
    expect(keys).not.toContain("tagline");
    expect(keys).not.toContain("googleMapsUrl");
    expect(keys).not.toContain("reraCertificateUrl");
    expect(keys).not.toContain("paymentPlanType");
    expect(keys).not.toContain("launchDate");
    expect(keys).not.toContain("constructionPercent");
    expect(keys).not.toContain("totalUnits");
    expect(keys).not.toContain("metaTitle");
  });

  it("marks fields the payload actually carries as RECEIVED, with the correct founder label", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" });
    const summary = buildFounderReviewSummary(completeness)!;
    const byKey = new Map(summary.fields.map((f) => [f.key, f]));
    expect(byKey.get("name")).toMatchObject({ label: "Project Name", status: "RECEIVED", value: "Linkbay Residences" });
    expect(byKey.get("locality")).toMatchObject({ label: "Locality", status: "RECEIVED", value: "Andheri West" });
    expect(byKey.get("reraNumber")).toMatchObject({ label: "RERA Number", status: "RECEIVED" });
    expect(byKey.get("priceMin")).toMatchObject({ label: "Starting Price", status: "RECEIVED" });
  });

  it("marks genuinely absent founder fields as MISSING, never fabricated", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" });
    const summary = buildFounderReviewSummary(completeness)!;
    const byKey = new Map(summary.fields.map((f) => [f.key, f]));
    expect(byKey.get("developerGroup")).toMatchObject({ status: "MISSING", value: null });
    expect(byKey.get("address")).toMatchObject({ status: "MISSING", value: null });
    expect(byKey.get("microMarket")).toMatchObject({ status: "MISSING", value: null });
    expect(byKey.get("possession")).toMatchObject({ status: "MISSING", value: null });
    expect(summary.missingCount).toBe(byKey.size - summary.receivedCount - summary.needsReviewCount);
  });

  it("targeted fix (Developer false-Missing regression) -- a populated developerGroup is RECEIVED, never MISSING, under its founder-facing 'Developer' label", () => {
    const completeness = buildProjectReviewCompleteness(
      { ...LINKBAY_PAYLOAD, developerGroup: "Adani Realty" },
      { localityName: "Andheri West" }
    );
    const summary = buildFounderReviewSummary(completeness)!;
    const developer = summary.fields.find((f) => f.key === "developerGroup")!;
    expect(developer.label).toBe("Developer");
    expect(developer.status).toBe("RECEIVED");
    expect(developer.value).toBe("Adani Realty");
  });

  it("D. targeted fix (Official Developer Website) -- appears immediately below Developer and above Locality in the founder-facing order", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" });
    const summary = buildFounderReviewSummary(completeness)!;
    const keys = summary.fields.map((f) => f.key);
    const developerIndex = keys.indexOf("developerGroup");
    const websiteIndex = keys.indexOf("developerWebsiteUrl");
    const localityIndex = keys.indexOf("locality");
    expect(websiteIndex).toBe(developerIndex + 1);
    expect(localityIndex).toBe(websiteIndex + 1);
  });

  it("E. Official Developer Website is MISSING with no override and no resolved Builder website, and RECEIVED once either is available", () => {
    const missing = buildFounderReviewSummary(buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" }))!;
    expect(missing.fields.find((f) => f.key === "developerWebsiteUrl")).toMatchObject({ status: "MISSING", value: null });

    const withOverride = buildFounderReviewSummary(
      buildProjectReviewCompleteness(
        { ...LINKBAY_PAYLOAD, developerWebsiteUrl: "https://www.adanirealty.com" },
        { localityName: "Andheri West" }
      )
    )!;
    expect(withOverride.fields.find((f) => f.key === "developerWebsiteUrl")).toMatchObject({
      label: "Official Developer Website",
      status: "RECEIVED",
      value: "https://www.adanirealty.com",
    });

    const withResolvedBuilderWebsite = buildFounderReviewSummary(
      buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West", officialDeveloperWebsiteUrl: "https://www.godrejproperties.com" })
    )!;
    expect(withResolvedBuilderWebsite.fields.find((f) => f.key === "developerWebsiteUrl")).toMatchObject({
      status: "RECEIVED",
      value: "https://www.godrejproperties.com",
    });
  });

  it("merges possessionMonth+possessionYear into one Possession field, RECEIVED only when both halves are", () => {
    const withPossession = { ...LINKBAY_PAYLOAD, possessionDateIso: "2028-10-01T00:00:00.000Z" };
    const completeness = buildProjectReviewCompleteness(withPossession);
    const summary = buildFounderReviewSummary(completeness)!;
    const possession = summary.fields.find((f) => f.key === "possession")!;
    expect(possession.status).toBe("RECEIVED");
    expect(possession.value).toBe("October 2028");
  });

  it("a NEEDS_REVIEW registry field (possible-duplicate mismatch) stays NEEDS_REVIEW, not silently RECEIVED or MISSING", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, {
      localityName: "Andheri West",
      matched: { name: "Linkbay Residences", status: "READY_TO_MOVE", reraNumber: "P51800047539" },
    });
    const summary = buildFounderReviewSummary(completeness)!;
    const status = summary.fields.find((f) => f.key === "status")!;
    expect(status.status).toBe("NEEDS_REVIEW");
    expect(status.reviewNote).toContain("Ready to Move");
    expect(summary.needsReviewCount).toBe(1);
  });

  it("counts never double-count a field: totalFields === received + missing + needsReview", () => {
    const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, {
      localityName: "Andheri West",
      matched: { name: "Different Name", status: "READY_TO_MOVE", reraNumber: "P00000000000" },
    });
    const summary = buildFounderReviewSummary(completeness)!;
    expect(summary.totalFields).toBe(summary.receivedCount + summary.missingCount + summary.needsReviewCount);
  });
});

describe("buildEnrichmentConflicts", () => {
  const completeness = buildProjectReviewCompleteness(LINKBAY_PAYLOAD, { localityName: "Andheri West" });

  it("returns an empty list when there is no persisted enrichment summary (never run)", () => {
    expect(buildEnrichmentConflicts(completeness, null)).toEqual([]);
    expect(buildEnrichmentConflicts(completeness, undefined)).toEqual([]);
  });

  it("returns an empty list when nothing is classified CONFLICT", () => {
    expect(buildEnrichmentConflicts(completeness, { reraNumber: "GREEN_NEW", description: "YELLOW" })).toEqual([]);
  });

  it("surfaces every CONFLICT-classified field with its label and CURRENT staged value, never a fabricated proposed value", () => {
    const conflicts = buildEnrichmentConflicts(completeness, { name: "CONFLICT", reraNumber: "GREEN_NEW" });
    expect(conflicts).toEqual([{ key: "name", label: "Name", existingValue: "Linkbay Residences" }]);
  });

  it("does not filter conflicts down to only founder-relevant fields — a conflict on any field is a real safety signal", () => {
    const conflicts = buildEnrichmentConflicts(completeness, { metaTitle: "CONFLICT" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].key).toBe("metaTitle");
  });

  it("lists multiple simultaneous conflicts", () => {
    const conflicts = buildEnrichmentConflicts(completeness, { name: "CONFLICT", status: "CONFLICT" });
    expect(conflicts.map((c) => c.key).sort()).toEqual(["name", "status"]);
  });
});
