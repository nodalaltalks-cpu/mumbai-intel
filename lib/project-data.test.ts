import { describe, expect, it } from "vitest";
import { buildProjectData, parseProjectForm, toProjectSchemaInput } from "./project-data";
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
  priceMinRupees: 44608000,
  possessionDateIso: "2028-10-01T00:00:00.000Z",
};

describe("toProjectSchemaInput — fields already working before Phase 35 (must not regress)", () => {
  it("maps name, description, localityId, status, category, address, RERA number, units/towers, price, dataSource, sourceRef", () => {
    const payload: ProjectImportPayload = { ...BASE_PAYLOAD, builderId: "bldr-1", address: "off New Link Rd", totalUnits: 300, totalTowers: 2 };
    const result = toProjectSchemaInput(payload);
    expect(result.name).toBe(payload.name);
    expect(result.description).toBe(payload.description);
    expect(result.builderId).toBe("bldr-1");
    expect(result.developerGroup).toBe(payload.developerGroup);
    expect(result.localityId).toBe(payload.localityId);
    expect(result.status).toBe("UNDER_CONSTRUCTION");
    expect(result.category).toBe("RESIDENTIAL");
    expect(result.address).toBe("off New Link Rd");
    expect(result.reraNumber).toBe(payload.reraNumber);
    expect(result.totalUnits).toBe(300);
    expect(result.totalTowers).toBe(2);
    expect(result.priceMinRupees).toBe(payload.priceMinRupees);
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

/**
 * Phase 68.1 -- regression coverage for the admin ProjectForm's own submit
 * path: parseProjectForm(FormData) -> buildProjectData(data) is exactly what
 * updateProjectAction/autosaveProjectAction run on every save (see
 * lib/actions/projects.ts). This pipeline itself was never the bug -- the
 * root cause was CoverImageUploader rendering its own <form> nested inside
 * ProjectForm's <form>, invalid HTML that made the browser's real DOM
 * disagree with React's tree and corrupted what `new FormData(formRef.current)`
 * captured client-side, before parseProjectForm ever saw it. Fixed by moving
 * CoverImageUploader out to its own card, same as every other post-creation
 * manager (ConfigurationsManager, BrochureUploader, ...) -- see
 * app/admin/components/ProjectForm.tsx and the edit page that composes it.
 * These tests pin down that the parse/build pipeline itself correctly
 * threads address, builderId and isPublished through a save, so a future
 * change to this pipeline can't reintroduce a *different* way to lose them.
 */
function projectFormData(fields: Record<string, string>): FormData {
  const data = new FormData();
  // Every field parseProjectForm reads via formData.get() -- a real submit always
  // includes all of these (ProjectForm renders every one, several as hidden inputs
  // carrying deprioritized values -- see ProjectForm.tsx's Phase 68 comments), so
  // omitting most of them here mirrors formData.get() returning null for a field
  // never present in the DOM, exactly like parseProjectForm's own null-tolerant
  // preprocessing (nullToEmptyString/emptyToUndefined) already expects.
  data.set("name", fields.name ?? "Kalpataru Vian");
  data.set("localityId", fields.localityId ?? "loc-andheri-west");
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("parseProjectForm + buildProjectData — Phase 68.1 save-path regression coverage", () => {
  it("editing the address field persists the new value", () => {
    const parsed = parseProjectForm(projectFormData({ address: "Near Andheri Metro Station, Andheri West, Mumbai" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).address).toBe("Near Andheri Metro Station, Andheri West, Mumbai");
  });

  it("clearing the address field persists null, not the previous value", () => {
    const parsed = parseProjectForm(projectFormData({ address: "" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).address).toBeNull();
  });

  it("changing the developer (builderId) persists the newly selected builder", () => {
    const parsed = parseProjectForm(projectFormData({ builderId: "bldr-godrej-properties" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).builderId).toBe("bldr-godrej-properties");
  });

  it("un-setting the developer (back to 'No developer') persists null", () => {
    const parsed = parseProjectForm(projectFormData({ builderId: "" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).builderId).toBeNull();
  });

  it("publishing a project (isPublished checked) persists true, given the status/category it requires", () => {
    const parsed = parseProjectForm(projectFormData({ isPublished: "on", status: "PRE_LAUNCH", category: "RESIDENTIAL" }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).isPublished).toBe(true);
  });

  it("unpublishing a project (isPublished unchecked) persists false", () => {
    // A real <input type="checkbox"> submits nothing at all when unchecked --
    // formData.get("isPublished") returns null here, not "off" or "false".
    const parsed = parseProjectForm(projectFormData({}));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(buildProjectData(parsed.data).isPublished).toBe(false);
  });

  it("publishing without status/category fails validation with a friendly per-field message, rather than silently saving half-published", () => {
    const parsed = parseProjectForm(projectFormData({ isPublished: "on" }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const messages = parsed.error.issues.map((i) => i.message);
    expect(messages).toContain("Status is required to publish this project.");
    expect(messages).toContain("Category is required to publish this project.");
  });

  it("editing address, developer and publish state together in one save doesn't clobber each other", () => {
    const parsed = parseProjectForm(
      projectFormData({
        address: "Off New Link Road, Andheri West",
        builderId: "bldr-godrej-properties",
        isPublished: "on",
        status: "PRE_LAUNCH",
        category: "RESIDENTIAL",
        reraNumber: "PR1180002600863",
      })
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const result = buildProjectData(parsed.data);
    expect(result.address).toBe("Off New Link Road, Andheri West");
    expect(result.builderId).toBe("bldr-godrej-properties");
    expect(result.isPublished).toBe(true);
    expect(result.reraNumber).toBe("PR1180002600863");
  });

  /**
   * Phase 68.1 -- the SECOND, more direct root cause behind the reported bug (address/
   * builderId/isPublished edits silently not saving): metaTitle/metaDescription are plain
   * `String?` columns (unlike dataSource/confidence/paymentPlanType, which are real Postgres
   * enum columns the DB itself guarantees are valid) -- Phase 68 kept them as hidden
   * "preserve unchanged" carry-through inputs on every submit (see ProjectForm.tsx), but a
   * handful of existing projects already had a metaTitle/metaDescription longer than this
   * schema allows (set before this form enforced maxLength, e.g. via enrichment/bulk-import).
   * Submitting that value unclamped made parseProjectForm() reject the WHOLE FormData with no
   * visible error -- silently blocking every other edit on the form for that project, forever,
   * regardless of the nested-<form> hydration bug fixed alongside this. The actual fix is in
   * ProjectForm.tsx (clamps the hidden inputs' defaultValue to 70/160 chars before submit) --
   * these tests pin down that parseProjectForm is right to reject an oversized value (so a
   * regression can't silently start accepting one), which is exactly why the clamp has to live
   * upstream of it, not here.
   */
  it("rejects a metaTitle longer than 70 characters with a clear per-field message", () => {
    const parsed = parseProjectForm(projectFormData({ metaTitle: "x".repeat(100) }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path).toEqual(["metaTitle"]);
  });

  it("rejects a metaDescription longer than 160 characters with a clear per-field message", () => {
    const parsed = parseProjectForm(projectFormData({ metaDescription: "x".repeat(200) }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.path).toEqual(["metaDescription"]);
  });

  it("accepts a metaTitle/metaDescription clamped to exactly the schema limit (what ProjectForm's hidden inputs now submit)", () => {
    const parsed = parseProjectForm(
      projectFormData({
        address: "Near Andheri Metro Station",
        metaTitle: "x".repeat(100).slice(0, 70),
        metaDescription: "x".repeat(200).slice(0, 160),
      })
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // The real bug: an oversized metaTitle/metaDescription blocked THIS field (address) too.
    expect(buildProjectData(parsed.data).address).toBe("Near Andheri Metro Station");
  });
});
