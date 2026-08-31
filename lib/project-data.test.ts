import { describe, expect, it } from "vitest";
import { toProjectSchemaInput } from "./project-data";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

/**
 * Phase 35 -- regression tests for the data-loss bug Phase 34 discovered:
 * toProjectSchemaInput() hardcoded 13 registry-tracked, Project-scalar
 * fields to `undefined` (or omitted them entirely), so a founder's
 * Phase 32/33-accepted enrichment values were silently discarded the moment
 * the EXISTING Approve button ran -- even though they'd been correctly
 * persisted into the PENDING staging payload.
 *
 * toProjectSchemaInput is a pure mapping function (no I/O, no auth, no
 * database) -- these tests call it directly with realistic staging
 * payloads. No staging record, Project, Builder, or Locality row is read or
 * written anywhere in this file. (It now lives in lib/project-data.ts, not
 * lib/actions/ingestion.ts, where it used to be private -- exporting it from
 * an ingestion.ts, a `"use server"` file, isn't allowed there, since every
 * export of such a file must itself be an async Server Action; this plain
 * mapper belongs in the same shared, non-action module buildProjectData/
 * ProjectSchemaInput already live in.)
 */
const BASE_PAYLOAD: ProjectImportPayload = {
  name: "Adani Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-andheri-west",
  reraNumber: "P51800047539",
  description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 6.9 Crore(s)",
  developerGroup: "Adani Realty & RC Group",
  priceMaxRupees: 69900000,
  priceMinRupees: 44608000,
  possessionDateIso: "2028-10-01T00:00:00.000Z",
};

describe("toProjectSchemaInput — fields already working before Phase 35 (must not regress)", () => {
  it("maps name, description, localityId, status, category, address, lat/long, RERA number/status, units/towers, price, dataSource, sourceRef", () => {
    const payload: ProjectImportPayload = { ...BASE_PAYLOAD, builderId: "bldr-1", address: "off New Link Rd", latitude: 19.13, longitude: 72.82, totalUnits: 300, totalTowers: 2, reraStatus: "Registered" };
    const result = toProjectSchemaInput(payload);
    expect(result.name).toBe(payload.name);
    expect(result.description).toBe(payload.description);
    expect(result.builderId).toBe("bldr-1");
    expect(result.developerGroup).toBe(payload.developerGroup);
    expect(result.localityId).toBe(payload.localityId);
    expect(result.status).toBe("UNDER_CONSTRUCTION");
    expect(result.category).toBe("RESIDENTIAL");
    expect(result.address).toBe("off New Link Rd");
    expect(result.latitude).toBe(19.13);
    expect(result.longitude).toBe(72.82);
    expect(result.reraNumber).toBe(payload.reraNumber);
    expect(result.reraStatus).toBe("Registered");
    expect(result.totalUnits).toBe(300);
    expect(result.totalTowers).toBe(2);
    expect(result.priceMinRupees).toBe(payload.priceMinRupees);
    expect(result.priceMaxRupees).toBe(payload.priceMaxRupees);
    expect(result.dataSource).toBe(payload.dataSource);
    expect(result.sourceRef).toBe(payload.sourceRef);
  });

  it("derives promisedPossession from possessionDateIso (unchanged mechanism)", () => {
    const result = toProjectSchemaInput(BASE_PAYLOAD);
    expect(result.promisedPossession).toEqual(new Date("2028-10-01T00:00:00.000Z"));
  });

  it("7. name/locality behave exactly as before -- always mapped straight through, never optional-guarded here", () => {
    const result = toProjectSchemaInput(BASE_PAYLOAD);
    expect(result.name).toBe("Adani Linkbay Residences");
    expect(result.localityId).toBe("loc-andheri-west");
  });

  it("8. isPublished (and the other flags) remain false on approval, unchanged", () => {
    const result = toProjectSchemaInput(BASE_PAYLOAD);
    expect(result.isPublished).toBe(false);
    expect(result.isFeatured).toBe(false);
    expect(result.isTrending).toBe(false);
    expect(result.isLuxury).toBe(false);
    expect(result.isAffordable).toBe(false);
  });

  it("6. a field genuinely absent from the payload remains safely undefined -- never fabricated", () => {
    const result = toProjectSchemaInput(BASE_PAYLOAD);
    expect(result.tagline).toBeUndefined();
    expect(result.videoUrl).toBeUndefined();
    expect(result.metaTitle).toBeUndefined();
    expect(result.reraCertificateUrl).toBeUndefined();
    expect(result.landAreaAcres).toBeUndefined();
  });
});

describe("toProjectSchemaInput — Phase 35 fix: previously-dropped accepted-enrichment fields now survive", () => {
  it("1. a single accepted enrichment field (tagline) survives the mapping", () => {
    const payload = { ...BASE_PAYLOAD, tagline: "A shoreline sanctuary shaped by the timeless dance of earth and sea" };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.tagline).toBe("A shoreline sanctuary shaped by the timeless dance of earth and sea");
  });

  it("2. multiple accepted enrichment fields survive together, none clobbering another", () => {
    const payload = {
      ...BASE_PAYLOAD,
      tagline: "A shoreline sanctuary",
      googleMapsUrl: "https://maps.app.goo.gl/orpAL4QXpzekw7FaA",
      reraCertificateUrl: "https://example.com/rera-cert.pdf",
      paymentPlanDescription: "20:80 payment plan",
      constructionPercent: 45,
      landAreaAcres: 2.5,
      videoUrl: "https://www.youtube.com/watch?v=X_PXTMFTVZM",
      tour360Url: "https://example.com/tour",
      metaTitle: "Godrej Skyshore Versova Mumbai",
      metaDescription: "Discover Godrej Skyshore in Versova, Andheri West, Mumbai.",
      ogImageUrl: "https://example.com/og.webp",
    };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.tagline).toBe("A shoreline sanctuary");
    expect(result.googleMapsUrl).toBe("https://maps.app.goo.gl/orpAL4QXpzekw7FaA");
    expect(result.reraCertificateUrl).toBe("https://example.com/rera-cert.pdf");
    expect(result.paymentPlanDescription).toBe("20:80 payment plan");
    expect(result.constructionPercent).toBe(45);
    expect(result.landAreaAcres).toBe(2.5);
    expect(result.videoUrl).toBe("https://www.youtube.com/watch?v=X_PXTMFTVZM");
    expect(result.tour360Url).toBe("https://example.com/tour");
    expect(result.metaTitle).toBe("Godrej Skyshore Versova Mumbai");
    expect(result.metaDescription).toBe("Discover Godrej Skyshore in Versova, Andheri West, Mumbai.");
    expect(result.ogImageUrl).toBe("https://example.com/og.webp");
  });

  it("3. Builder ID survives approval mapping (already worked, re-confirmed alongside the fix)", () => {
    const payload = { ...BASE_PAYLOAD, builderId: "bldr-real-id" };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.builderId).toBe("bldr-real-id");
  });

  it("4. Locality ID survives approval mapping (already worked, re-confirmed alongside the fix)", () => {
    const result = toProjectSchemaInput(BASE_PAYLOAD);
    expect(result.localityId).toBe("loc-andheri-west");
  });

  it("highlights: a real accepted string[] array is converted into the newline-joined form buildProjectData()'s existing parseHighlights() expects, and round-trips back to an array", () => {
    const payload = { ...BASE_PAYLOAD, highlights: ["Distance highlights: Airport 18 mins", "Sea view", "Coastal Road"] };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.highlights).toBe("Distance highlights: Airport 18 mins\nSea view\nCoastal Road");
  });

  it("paymentPlanType: only passes through a genuinely valid enum value -- an unrecognized string is treated as absent, never a silently-invalid enum write", () => {
    const validPayload = { ...BASE_PAYLOAD, paymentPlanType: "CONSTRUCTION_LINKED" };
    expect(toProjectSchemaInput(validPayload as ProjectImportPayload).paymentPlanType).toBe("CONSTRUCTION_LINKED");

    const invalidPayload = { ...BASE_PAYLOAD, paymentPlanType: "Some Random Unvalidated Plan Text" };
    expect(toProjectSchemaInput(invalidPayload as ProjectImportPayload).paymentPlanType).toBeUndefined();
  });

  it("malformed highlights (not a string array) is safely ignored rather than crashing parseHighlights downstream", () => {
    const payload = { ...BASE_PAYLOAD, highlights: "not-an-array" };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.highlights).toBeUndefined();
  });
});

describe("toProjectSchemaInput — deliberately still NOT mapped (real, separate limitations, not this phase's bug)", () => {
  it("microMarketId stays unmapped -- the payload only ever holds a raw NAME, not a resolved MicroMarket id", () => {
    const payload = { ...BASE_PAYLOAD, microMarketId: "Versova, Andheri (W)" };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.microMarketId).toBeUndefined();
  });

  it("actualPossession stays unmapped -- registry/Phase 32 store it as free text, not a real Date", () => {
    const payload = { ...BASE_PAYLOAD, actualPossession: "Handover expected Q1 2028" };
    const result = toProjectSchemaInput(payload as ProjectImportPayload);
    expect(result.actualPossession).toBeUndefined();
  });
});
