import { describe, expect, it } from "vitest";
import {
  buildBuilderReviewCompleteness,
  buildInfraReviewCompleteness,
  buildLocalityReviewCompleteness,
  buildProjectReviewCompleteness,
  buildTransactionReviewCompleteness,
  isMeaningfulValue,
} from "./reviewFieldRegistry";
import type { ProjectImportPayload } from "./connectors/fileImport/types";

// The exact shape of one of the four real Phase 13E MagicBricks staging
// records (Adani Linkbay Residences) -- used as the realistic "partial
// payload" fixture throughout.
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

describe("isMeaningfulValue (Part F: never Boolean(value))", () => {
  it("CASE 4: treats 0 as meaningful", () => {
    expect(isMeaningfulValue(0)).toBe(true);
  });
  it("CASE 4: treats false as meaningful", () => {
    expect(isMeaningfulValue(false)).toBe(true);
  });
  it("CASE 4: treats an empty array as meaningful (its presence is the signal)", () => {
    expect(isMeaningfulValue([])).toBe(true);
  });
  it("CASE 3: null is not meaningful", () => {
    expect(isMeaningfulValue(null)).toBe(false);
  });
  it("CASE 3: undefined is not meaningful", () => {
    expect(isMeaningfulValue(undefined)).toBe(false);
  });
  it("CASE 3: an empty/whitespace string is not meaningful", () => {
    expect(isMeaningfulValue("")).toBe(false);
    expect(isMeaningfulValue("   ")).toBe(false);
  });
  it("a non-empty string is meaningful", () => {
    expect(isMeaningfulValue("Adani Linkbay Residences")).toBe(true);
  });
  it("NaN is not meaningful", () => {
    expect(isMeaningfulValue(Number.NaN)).toBe(false);
  });
});

describe("buildProjectReviewCompleteness — CASE 2: partial real payload (Adani, Phase 13E)", () => {
  const result = buildProjectReviewCompleteness(ADANI_PAYLOAD, {
    localityName: "Andheri West",
  });

  it("denominator is computed from the actual field registry, not hardcoded", () => {
    const flat = result.groups.flatMap((g) => g.fields);
    expect(result.totalFields).toBe(flat.length);
    expect(result.totalFields).toBe(result.receivedCount + result.missingCount + result.needsReviewCount);
  });

  it("marks fields the payload actually carries as RECEIVED", () => {
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.status).toBe("RECEIVED");
    expect(byKey.get("name")?.value).toBe("Adani Linkbay Residences");
    expect(byKey.get("locality")?.status).toBe("RECEIVED");
    expect(byKey.get("locality")?.value).toBe("Andheri West");
    expect(byKey.get("reraNumber")?.status).toBe("RECEIVED");
    expect(byKey.get("priceMin")?.status).toBe("RECEIVED");
    expect(byKey.get("possessionMonth")?.status).toBe("RECEIVED");
    expect(byKey.get("possessionMonth")?.value).toBe("October");
    expect(byKey.get("possessionYear")?.value).toBe("2028");
    expect(byKey.get("description")?.status).toBe("RECEIVED");
    expect(byKey.get("developerGroup")?.status).toBe("RECEIVED");
    expect(byKey.get("sourceRef")?.status).toBe("RECEIVED");
    expect(byKey.get("dataSource")?.status).toBe("RECEIVED");
  });

  it("marks fields genuinely absent from this payload as MISSING, never invented", () => {
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("address")?.status).toBe("MISSING");
    expect(byKey.get("totalUnits")?.status).toBe("MISSING");
    expect(byKey.get("totalTowers")?.status).toBe("MISSING");
    expect(byKey.get("launchDate")?.status).toBe("MISSING");
    // Structurally absent from ProjectImportPayload entirely:
    expect(byKey.get("tagline")?.status).toBe("MISSING");
    expect(byKey.get("microMarket")?.status).toBe("MISSING");
    expect(byKey.get("amenities")?.status).toBe("MISSING");
    expect(byKey.get("images")?.status).toBe("MISSING");
    expect(byKey.get("videoUrl")?.status).toBe("MISSING");
    expect(byKey.get("metaTitle")?.status).toBe("MISSING");
    every_missing_field_has_null_value(result);
  });

  it("no field is NEEDS_REVIEW when there is no possible-duplicate match (the real Phase 13E case)", () => {
    expect(result.needsReviewCount).toBe(0);
  });

  it("CASE 4: constructionPercent of 0 is RECEIVED, not MISSING", () => {
    const withZeroPercent = { ...ADANI_PAYLOAD, constructionPercent: 0 } as unknown as ProjectImportPayload;
    const r = buildProjectReviewCompleteness(withZeroPercent);
    const byKey = new Map(r.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("constructionPercent")?.status).toBe("RECEIVED");
    expect(byKey.get("constructionPercent")?.value).toBe("0%");
  });

  it("CASE 4: totalUnits of 0 is RECEIVED, not MISSING", () => {
    const withZeroUnits = { ...ADANI_PAYLOAD, totalUnits: 0 };
    const r = buildProjectReviewCompleteness(withZeroUnits);
    const byKey = new Map(r.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("totalUnits")?.status).toBe("RECEIVED");
    expect(byKey.get("totalUnits")?.value).toBe("0");
  });

  it("targeted fix (Payment Plan -- one clean founder field): only ONE 'paymentPlans' row exists -- the legacy paymentPlanType/paymentPlanDescription rows are gone", () => {
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.has("paymentPlanType")).toBe(false);
    expect(byKey.has("paymentPlanDescription")).toBe(false);
    expect(byKey.has("paymentPlans")).toBe(true);
  });

  it("targeted fix (Payment Plan): a legacy-only payload (paymentPlanType/paymentPlanDescription, no paymentPlans array) still shows the consolidated field as RECEIVED, never MISSING", () => {
    const legacyPayload = {
      ...ADANI_PAYLOAD,
      paymentPlanType: "Construction Linked",
      paymentPlanDescription: "10:80:10",
    } as unknown as ProjectImportPayload;
    const r = buildProjectReviewCompleteness(legacyPayload);
    const byKey = new Map(r.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("paymentPlans")?.status).toBe("RECEIVED");
    expect(byKey.get("paymentPlans")?.value).toBe("1 plan(s) listed");
  });

  it("targeted fix (Slug editability): payload.slug (absent) falls back to the exact bare auto-generated-from-name slug, exactly as before -- never a decorated string (that would get re-slugified verbatim if the founder clicked Edit -> Save Edit without changing anything)", () => {
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("slug")?.status).toBe("RECEIVED");
    expect(byKey.get("slug")?.value).toBe("adani-linkbay-residences");
  });

  it("targeted fix (Slug editability): a founder-provided payload.slug override is shown instead, immediately, as the bare value", () => {
    const withSlugOverride = { ...ADANI_PAYLOAD, slug: "linkbay-residences-custom" };
    const r = buildProjectReviewCompleteness(withSlugOverride);
    const byKey = new Map(r.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("slug")?.status).toBe("RECEIVED");
    expect(byKey.get("slug")?.value).toBe("linkbay-residences-custom");
  });
});

function every_missing_field_has_null_value(result: ReturnType<typeof buildProjectReviewCompleteness>) {
  for (const f of result.groups.flatMap((g) => g.fields)) {
    if (f.status === "MISSING") expect(f.value).toBeNull();
  }
}

describe("buildProjectReviewCompleteness — CASE 1: fully populated payload", () => {
  // Includes keys that don't exist on the strict ProjectImportPayload TS type
  // (tagline, microMarketId, amenities, images, ...) via the raw-JSON cast,
  // proving the registry picks up a source that DOES someday provide them --
  // it is not hardcoded to always show these as missing.
  const fullPayload = {
    ...ADANI_PAYLOAD,
    address: "123 Link Road",
    totalUnits: 240,
    totalTowers: 3,
    launchDateIso: "2024-01-01T00:00:00.000Z",
    builderId: "builder-1",
    developerWebsiteUrl: "https://www.adanirealty.com",
    tagline: "Live by the bay",
    microMarketId: "mm-1",
    googleMapsUrl: "https://maps.google.com/?q=19.1364,72.8296",
    reraCertificateUrl: "https://maharera.example/cert/P51800047539",
    paymentPlanType: "CONSTRUCTION_LINKED",
    paymentPlanDescription: "10:80:10",
    paymentPlans: ["Construction Linked Plan: 10:80:10, payable over 24 months", "Down Payment Plan: 5% discount on full upfront payment"],
    actualPossession: "2028-10-15T00:00:00.000Z",
    constructionPercent: 42,
    landAreaAcres: 5.5,
    highlights: ["Sea view", "5 min to metro"],
    specifications: [{ category: "Structure", detail: "RCC" }],
    amenities: ["Pool", "Gym"],
    faqs: [{ question: "Q", answer: "A" }],
    coverImageUrl: "https://cdn.example/cover.jpg",
    images: ["https://cdn.example/1.jpg"],
    videoUrl: "https://youtube.com/watch?v=x",
    tour360Url: "https://tour.example/360",
    brochureUrl: "https://cdn.example/brochure.pdf",
    documents: ["https://cdn.example/doc.pdf"],
    metaTitle: "Adani Linkbay Residences | NoDalalTalks",
    metaDescription: "Explore Adani Linkbay Residences in Andheri West.",
    ogImageUrl: "https://cdn.example/og.jpg",
  } as unknown as ProjectImportPayload;

  const result = buildProjectReviewCompleteness(fullPayload, {
    localityName: "Andheri West",
  });

  it("every field is RECEIVED, nothing MISSING", () => {
    expect(result.missingCount).toBe(0);
    expect(result.receivedCount).toBe(result.totalFields);
  });
});

describe("buildProjectReviewCompleteness — CASE 6: possible-duplicate match with differing values", () => {
  it("flags NEEDS_REVIEW only on the fields that actually differ from the matched existing project", () => {
    const result = buildProjectReviewCompleteness(ADANI_PAYLOAD, {
      localityName: "Andheri West",
      matched: { name: "Adani Linkbay Residences", status: "READY_TO_MOVE", reraNumber: "P51800047539" },
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.status).toBe("RECEIVED"); // same name, no conflict
    expect(byKey.get("status")?.status).toBe("NEEDS_REVIEW"); // status differs
    expect(byKey.get("status")?.reviewNote).toContain("Ready to Move");
    expect(byKey.get("reraNumber")?.status).toBe("RECEIVED"); // same RERA, no conflict
    expect(result.needsReviewCount).toBe(1);
  });

  it("flags name and RERA too when those specifically differ", () => {
    const result = buildProjectReviewCompleteness(ADANI_PAYLOAD, {
      matched: { name: "Adani Link Bay Res.", status: "UNDER_CONSTRUCTION", reraNumber: "P00000000000" },
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.status).toBe("NEEDS_REVIEW");
    expect(byKey.get("reraNumber")?.status).toBe("NEEDS_REVIEW");
    expect(byKey.get("status")?.status).toBe("RECEIVED");
  });
});

describe("CASE 5: a different (hypothetical future) source payload — no source-specific branching", () => {
  it("a Housing.com-shaped payload (same ProjectImportPayload interface, different sourceRef/dataSource) computes normally", () => {
    const housingComPayload: ProjectImportPayload = {
      ...ADANI_PAYLOAD,
      name: "Some Other Project",
      sourceRef: "housingcom:listing-999",
      dataSource: "EXTERNAL_OPEN_DATA",
    };
    const result = buildProjectReviewCompleteness(housingComPayload, { localityName: "Andheri East" });
    expect(result.totalFields).toBeGreaterThan(0);
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.value).toBe("Some Other Project");
    expect(byKey.get("sourceRef")?.value).toBe("housingcom:listing-999");
  });
});

describe("other entity types (source-agnostic across entityType, using only real existing payload fields)", () => {
  it("Builder", () => {
    const result = buildBuilderReviewCompleteness({
      name: "Godrej Properties Ltd.",
      dataSource: "EXTERNAL_OPEN_DATA",
      sourceRef: "manual:test",
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.status).toBe("RECEIVED");
    expect(byKey.get("headquarters")?.status).toBe("MISSING");
  });

  it("Locality", () => {
    const result = buildLocalityReviewCompleteness({
      name: "Andheri West",
      dataSource: "EXTERNAL_OPEN_DATA",
      sourceRef: "manual:test",
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("name")?.status).toBe("RECEIVED");
    expect(byKey.get("pincode")?.status).toBe("MISSING");
  });

  it("Transaction", () => {
    const result = buildTransactionReviewCompleteness({
      localityId: "loc-1",
      type: "SALE",
      registrationDateIso: "2026-01-01T00:00:00.000Z",
      valueRupees: 5000000,
      dataSource: "EXTERNAL_OPEN_DATA",
      sourceRef: "manual:test",
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("valueRupees")?.status).toBe("RECEIVED");
    expect(byKey.get("project")?.status).toBe("MISSING");
  });

  it("InfraAsset", () => {
    const result = buildInfraReviewCompleteness({
      type: "METRO_STATION",
      name: "Andheri Metro",
      latitude: 19.1197,
      longitude: 72.8468,
      sourceRef: "osm:node/123",
    });
    const byKey = new Map(result.groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get("latitude")?.status).toBe("RECEIVED");
    expect(byKey.get("detail")?.status).toBe("MISSING");
  });
});
