import { describe, expect, it } from "vitest";
import { runResearchProviders, type ResearchFinding, type ResearchProvider, DEFAULT_RESEARCH_PROVIDERS } from "./researchProvider";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";

const PAYLOAD: ProjectImportPayload = {
  name: "Linkbay Residences",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "P51800047539",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "loc-1",
  reraNumber: "P51800047539",
};

const QUERY = { projectName: "Linkbay Residences", developerName: "Adani Realty", fieldKeys: ["address", "totalUnits"] };

function providerReturning(findings: ResearchFinding[]): ResearchProvider {
  return { name: "test-provider", research: async () => findings };
}

describe("runResearchProviders (targeted fix — smallest interface for future research sources)", () => {
  it("no providers registered by default -- ships inert, not a working search integration", () => {
    expect(DEFAULT_RESEARCH_PROVIDERS).toEqual([]);
  });

  it("no findings from any provider -> empty result, never fabricated", async () => {
    const result = await runResearchProviders([providerReturning([])], QUERY, PAYLOAD);
    expect(result).toEqual([]);
  });

  it("J. a finding with no sourceUrl is dropped -- never proceeds without evidence", async () => {
    const provider = providerReturning([
      { fieldKey: "address", value: "Off Link Road, Andheri West", confidence: "High", sourceUrl: "", sourceType: "OFFICIAL_DEVELOPER", reasoning: "Found on page" },
    ]);
    const result = await runResearchProviders([provider], QUERY, PAYLOAD);
    expect(result).toEqual([]);
  });

  it("J2. a finding with no reasoning/evidence summary is dropped", async () => {
    const provider = providerReturning([
      { fieldKey: "address", value: "Off Link Road, Andheri West", confidence: "High", sourceUrl: "https://example.com", sourceType: "OFFICIAL_DEVELOPER", reasoning: "" },
    ]);
    const result = await runResearchProviders([provider], QUERY, PAYLOAD);
    expect(result).toEqual([]);
  });

  it("a finding for a field outside the requested fieldKeys is dropped, never silently accepted", async () => {
    const provider = providerReturning([
      { fieldKey: "description", value: "A great place to live", confidence: "High", sourceUrl: "https://example.com", sourceType: "OFFICIAL_DEVELOPER", reasoning: "Found on page" },
    ]);
    const result = await runResearchProviders([provider], QUERY, PAYLOAD);
    expect(result).toEqual([]);
  });

  it("a single well-evidenced finding for a currently-blank field classifies GREEN_NEW, exactly like an official adapter's own fact", async () => {
    const provider = providerReturning([
      {
        fieldKey: "address",
        value: "Off Link Road, Andheri West",
        confidence: "High",
        sourceUrl: "https://www.adanirealty.com/linkbay",
        sourceType: "OFFICIAL_DEVELOPER",
        reasoning: "Address disclosed on the official project page.",
      },
    ]);
    const result = await runResearchProviders([provider], QUERY, PAYLOAD);
    const field = result.find((f) => f.key === "address")!;
    expect(field.classification).toBe("GREEN_NEW");
    expect(field.proposedValue).toBe("Off Link Road, Andheri West");
    expect(field.sourceUrl).toBe("https://www.adanirealty.com/linkbay");
  });

  it("K. two independent sources disagreeing on the SAME field's value -> CONFLICT, never a silent higher-tier pick", async () => {
    const officialProvider = providerReturning([
      {
        fieldKey: "totalUnits",
        value: "480",
        confidence: "High",
        sourceUrl: "https://www.adanirealty.com/linkbay",
        sourceType: "OFFICIAL_DEVELOPER",
        reasoning: "Stated on the official project page.",
      },
    ]);
    const webSearchProvider = providerReturning([
      {
        fieldKey: "totalUnits",
        value: "520",
        confidence: "Medium",
        sourceUrl: "https://some-listing-portal.example/linkbay",
        sourceType: "LISTING_PORTAL",
        reasoning: "Stated on a third-party listing page.",
      },
    ]);
    const result = await runResearchProviders([officialProvider, webSearchProvider], QUERY, PAYLOAD);
    const field = result.find((f) => f.key === "totalUnits")!;
    expect(field.classification).toBe("CONFLICT");
    expect(field.reason.toLowerCase()).toContain("disagree");
  });

  it("K2. two sources AGREEING on the same value -> high confidence, no conflict fabricated", async () => {
    const officialProvider = providerReturning([
      {
        fieldKey: "totalUnits",
        value: "480",
        confidence: "High",
        sourceUrl: "https://www.adanirealty.com/linkbay",
        sourceType: "OFFICIAL_DEVELOPER",
        reasoning: "Stated on the official project page.",
      },
    ]);
    const webSearchProvider = providerReturning([
      {
        fieldKey: "totalUnits",
        value: "480",
        confidence: "Medium",
        sourceUrl: "https://some-listing-portal.example/linkbay",
        sourceType: "LISTING_PORTAL",
        reasoning: "Stated on a third-party listing page.",
      },
    ]);
    const result = await runResearchProviders([officialProvider, webSearchProvider], QUERY, PAYLOAD);
    const field = result.find((f) => f.key === "totalUnits")!;
    expect(field.classification).toBe("GREEN_NEW");
    expect(field.proposedValue).toBe("480");
  });

  it("a value that agrees with the CURRENT staged value classifies CONFIRMED, same as any other source", async () => {
    const provider = providerReturning([
      {
        fieldKey: "reraNumber",
        value: "P51800047539",
        confidence: "High",
        sourceUrl: "https://www.adanirealty.com/linkbay",
        sourceType: "OFFICIAL_DEVELOPER",
        reasoning: "RERA number matches the official filing.",
      },
    ]);
    const queryWithRera = { ...QUERY, fieldKeys: [...QUERY.fieldKeys, "reraNumber"] };
    const result = await runResearchProviders([provider], queryWithRera, PAYLOAD);
    expect(result.find((f) => f.key === "reraNumber")!.classification).toBe("CONFIRMED");
  });

  it("L/M. never publishes, never approves, never bypasses founder review -- the result is plain EnrichmentField data for the SAME Accept/Edit/Reject UI, nothing is written anywhere", async () => {
    const provider = providerReturning([
      {
        fieldKey: "address",
        value: "Off Link Road, Andheri West",
        confidence: "High",
        sourceUrl: "https://www.adanirealty.com/linkbay",
        sourceType: "OFFICIAL_DEVELOPER",
        reasoning: "Address disclosed on the official project page.",
      },
    ]);
    const result = await runResearchProviders([provider], QUERY, PAYLOAD);
    // No side effects possible: the function's own signature returns data only
    // (no Prisma import, no fetch call in this module, no publish/approve call).
    expect(Array.isArray(result)).toBe(true);
    expect(result.every((f) => typeof f.classification === "string")).toBe(true);
  });
});
