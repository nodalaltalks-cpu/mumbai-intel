import { describe, expect, it } from "vitest";
import { RESEARCHABLE_FIELD_KEYS, selectResearchTargetFields, generateResearchQueries } from "./researchQueryGeneration";
import type { EnrichmentField } from "./types";

function field(key: string, classification: EnrichmentField["classification"]): EnrichmentField {
  return { key, label: key, group: "General", currentValue: null, proposedValue: null, sourceUrl: null, sourceType: null, confidence: null, classification, reason: "" };
}

describe("selectResearchTargetFields (Section 1 -- research target field selection)", () => {
  it("selects MISSING/YELLOW/CONFLICT fields restricted to the curated researchable set", () => {
    const fields = [
      field("address", "MISSING"),
      field("reraNumber", "YELLOW"),
      field("status", "CONFLICT"),
      field("name", "CONFIRMED"),
      field("description", "GREEN_NEW"),
    ];
    expect(selectResearchTargetFields(fields).sort()).toEqual(["address", "reraNumber", "status"].sort());
  });

  it("never targets a field outside RESEARCHABLE_FIELD_KEYS, even if it's MISSING", () => {
    const fields = [field("sourceRef", "MISSING"), field("dataSource", "MISSING"), field("slug", "MISSING")];
    expect(selectResearchTargetFields(fields)).toEqual([]);
  });

  it("never targets a FOUNDER_EDITED field -- founder-authority protection applies to target selection too", () => {
    const fields = [field("address", "FOUNDER_EDITED")];
    expect(selectResearchTargetFields(fields)).toEqual([]);
  });

  it("one missing field never blocks selection of the others -- every eligible field is returned together", () => {
    const fields = RESEARCHABLE_FIELD_KEYS.map((k) => field(k, "MISSING"));
    expect(selectResearchTargetFields(fields).sort()).toEqual([...RESEARCHABLE_FIELD_KEYS].sort());
  });

  it("an explicit requestedFieldKeys list further restricts selection (Section 10 -- researching selected fields only)", () => {
    const fields = [field("address", "MISSING"), field("reraNumber", "MISSING")];
    expect(selectResearchTargetFields(fields, ["address"])).toEqual(["address"]);
  });
});

describe("generateResearchQueries (Section 11 -- query generation)", () => {
  it("generates project-specific queries for every researchable field", () => {
    const querySets = generateResearchQueries({ projectName: "Linkbay Residences", developerName: "Adani Realty" });
    const keys = querySets.map((q) => q.fieldKey);
    expect(keys).toEqual(expect.arrayContaining(["reraNumber", "address", "possessionMonth"]));
    // developerGroup/developerWebsiteUrl deliberately query the DEVELOPER name alone
    // (Section 11's own example: `"[Developer] official website"`) -- every other
    // field's queries stay project-specific.
    const projectScoped = querySets.filter((s) => s.fieldKey !== "developerGroup" && s.fieldKey !== "developerWebsiteUrl");
    for (const set of projectScoped) {
      expect(set.queries.length).toBeGreaterThan(0);
      for (const q of set.queries) expect(q).toContain("Linkbay Residences");
    }
  });

  it("RERA queries explicitly mention MahaRERA, per the task's own example", () => {
    const querySets = generateResearchQueries({ projectName: "Linkbay Residences", developerName: "Adani Realty" });
    const rera = querySets.find((q) => q.fieldKey === "reraNumber")!;
    expect(rera.queries.some((q) => /MahaRERA/i.test(q))).toBe(true);
  });

  it("developer-website queries use the developer name, never the project name alone", () => {
    const querySets = generateResearchQueries({ projectName: "Linkbay Residences", developerName: "Adani Realty" });
    const website = querySets.find((q) => q.fieldKey === "developerWebsiteUrl")!;
    expect(website.queries.some((q) => q.includes("Adani Realty") && q.toLowerCase().includes("official website"))).toBe(true);
  });

  it("without a developer name, still generates usable project-only queries (never throws, never fabricates a developer)", () => {
    const querySets = generateResearchQueries({ projectName: "Linkbay Residences" });
    expect(querySets.length).toBeGreaterThan(0);
    const developerWebsite = querySets.find((q) => q.fieldKey === "developerWebsiteUrl");
    expect(developerWebsite).toBeUndefined(); // no developer name -> nothing safe to search for this field
  });
});
