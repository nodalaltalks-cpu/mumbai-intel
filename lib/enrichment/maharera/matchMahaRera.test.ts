import { describe, expect, it } from "vitest";
import { classifyMahaReraMatch } from "./matchMahaRera";
import type { MahaRERARecord } from "./types";

const RECORD_4TH_AVENUE: MahaRERARecord = {
  reraNumber: "P51800023072",
  registeredProjectName: "SunteckCity 4th Avenue Goregaon",
  promoterName: "Sunteck Realty Limited",
  location: "Goregaon West, Mumbai Suburban",
};

const RECORD_LEGAL_VARIATION: MahaRERARecord = {
  reraNumber: "P51800099999",
  registeredProjectName: "CTS No. 1234 Residential Development, Wing A",
  promoterName: "Sunteck Realty Limited",
  location: "Goregaon West, Mumbai Suburban",
};

const RECORD_OTHER_DEVELOPER_SAME_LOCATION: MahaRERARecord = {
  reraNumber: "P51800011111",
  registeredProjectName: "Some Other Project",
  promoterName: "A Totally Different Developer Pvt Ltd",
  location: "Goregaon West, Mumbai Suburban",
};

const RECORD_SAME_DEVELOPER_OTHER_LOCATION: MahaRERARecord = {
  reraNumber: "P51800022222",
  registeredProjectName: "Sunteck Some Other Project",
  promoterName: "Sunteck Realty Limited",
  location: "Kalyan, Thane",
};

describe("classifyMahaReraMatch (Phase 52 Part Q -- 10 required name-mismatch scenarios)", () => {
  it("1. official name == RERA name -> matches (developer + location agree)", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("STRONG_MATCH");
    expect(result.matchedRecord?.reraNumber).toBe("P51800023072");
  });

  it("2. official name != RERA name but same real project (developer+location agree) -> STRONG_MATCH, never rejected for a name mismatch", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "Sunteck Altavia", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      [RECORD_LEGAL_VARIATION]
    );
    expect(result.classification).toBe("STRONG_MATCH");
    expect(result.matchedRecord?.registeredProjectName).toBe("CTS No. 1234 Residential Development, Wing A");
  });

  it("3. RERA name is an explicit legal/regulatory variation (CTS-number wording) -> still STRONG_MATCH", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "Sunteck Example", officialDeveloperName: "Sunteck Realty Limited", officialLocalityName: "Goregaon West" },
      [RECORD_LEGAL_VARIATION]
    );
    expect(result.classification).toBe("STRONG_MATCH");
  });

  it("4. multiple RERA projects share this developer+location -> AMBIGUOUS_MATCH, never guessed down to one", () => {
    const secondSameDeveloperLocation: MahaRERARecord = { ...RECORD_4TH_AVENUE, reraNumber: "P51800088888", registeredProjectName: "SunteckCity Phase 5" };
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      [RECORD_4TH_AVENUE, secondSameDeveloperLocation]
    );
    expect(result.classification).toBe("AMBIGUOUS_MATCH");
    expect(result.candidateRecords).toHaveLength(2);
  });

  it("5. developer matches but location differs -> NO_MATCH (one conflicting strong signal is never resolved into a guess)", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      [RECORD_SAME_DEVELOPER_OTHER_LOCATION]
    );
    expect(result.classification).toBe("NO_MATCH");
  });

  it("6. location matches but developer differs -> NO_MATCH", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      [RECORD_OTHER_DEVELOPER_SAME_LOCATION]
    );
    expect(result.classification).toBe("NO_MATCH");
  });

  it("7. an exact RERA number match is the strongest evidence -> EXACT_MATCH even before checking developer/location", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West", officialReraNumber: "P51800023072" },
      [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("EXACT_MATCH");
  });

  it("8. no RERA number available at all -> falls back to developer+location evidence, still resolves confidently", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West", officialReraNumber: null },
      [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("STRONG_MATCH");
  });

  it("9. MahaRERA has zero records at all matching developer or location -> NO_MATCH (available evidence does not support a relationship)", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West" },
      []
    );
    expect(result.classification).toBe("NO_MATCH");
  });

  it("10. a wildly different (e.g. third-party-sourced) project name never blocks a match when developer+location genuinely agree", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "Some Totally Different Third-Party Listing Title", officialDeveloperName: "Sunteck Realty Limited", officialLocalityName: "Goregaon West" },
      [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("STRONG_MATCH");
  });

  it("an exact RERA number given but not found among records falls through to developer+location evidence rather than asserting failure", () => {
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West", officialReraNumber: "P00000000000" },
      [RECORD_4TH_AVENUE]
    );
    expect(result.classification).toBe("STRONG_MATCH");
  });

  it("a given RERA number matching more than one record -> AMBIGUOUS_MATCH", () => {
    const duplicateReraRecord: MahaRERARecord = { ...RECORD_4TH_AVENUE, registeredProjectName: "Duplicate Entry" };
    const result = classifyMahaReraMatch(
      { officialProjectName: "SunteckCity 4th Avenue Goregaon", officialDeveloperName: "Sunteck Realty", officialLocalityName: "Goregaon West", officialReraNumber: "P51800023072" },
      [RECORD_4TH_AVENUE, duplicateReraRecord]
    );
    expect(result.classification).toBe("AMBIGUOUS_MATCH");
  });
});
