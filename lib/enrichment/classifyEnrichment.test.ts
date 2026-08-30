import { describe, expect, it } from "vitest";
import { classifyProjectEnrichment, mergeEnrichmentResults } from "./classifyEnrichment";
import { buildProjectReviewCompleteness } from "../ingestion/reviewFieldRegistry";
import { GODREJ_SKY_SHORE_SOURCE_FACTS, GODREJ_SKY_SHORE_SOURCE_META } from "./fixtures/godrejSkyShoreSourceFacts";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";
import type { SourceFactsMap, SourceMeta } from "./types";

// The exact real staging payload for Godrej Sky Shore (Phase 13E), re-verified
// unchanged in the database as of Phase 27/28.
const GODREJ_PAYLOAD: ProjectImportPayload = {
  name: "Godrej Sky Shore",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  sourceRef: "PM1180002500076",
  dataSource: "EXTERNAL_OPEN_DATA",
  localityId: "cmteri8u70000zchqy5as7ydl",
  reraNumber: "PM1180002500076",
  description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 8.4 Crore(s)",
  developerGroup: "Godrej Properties Ltd.",
  priceMaxRupees: 84000000,
  priceMinRupees: 84000000,
  possessionDateIso: "2031-12-01T00:00:00.000Z",
};

const CONTEXT = { localityName: "Andheri West" };

function byKey(fields: ReturnType<typeof classifyProjectEnrichment>, key: string) {
  return fields.find((f) => f.key === key);
}

describe("classifyProjectEnrichment — Part M rules (generic, not project-specific)", () => {
  it("1. blank field + reliable (high-confidence) source -> GREEN_NEW", () => {
    const facts: SourceFactsMap = { tagline: { value: "A calm coastal address", confidence: "High" } };
    const meta: SourceMeta = { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" };
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, facts, meta);
    const f = byKey(result, "tagline")!;
    expect(f.classification).toBe("GREEN_NEW");
    expect(f.currentValue).toBeNull();
    expect(f.proposedValue).toBe("A calm coastal address");
  });

  it("2. blank field + ambiguous source -> YELLOW", () => {
    const facts: SourceFactsMap = { tagline: { value: "some marketing prose", confidence: "Medium", ambiguous: true } };
    const meta: SourceMeta = { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" };
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, facts, meta);
    expect(byKey(result, "tagline")!.classification).toBe("YELLOW");
  });

  it("3. existing value + identical source value -> CONFIRMED", () => {
    const facts: SourceFactsMap = { locality: { value: "Andheri West", confidence: "High" } };
    const meta: SourceMeta = { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" };
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, facts, meta);
    expect(byKey(result, "locality")!.classification).toBe("CONFIRMED");
  });

  it("4. existing value + conflicting source value -> CONFLICT, proposedValue shown but nothing auto-changed", () => {
    const facts: SourceFactsMap = { name: { value: "A Totally Different Name", confidence: "High" } };
    const meta: SourceMeta = { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" };
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, facts, meta);
    const f = byKey(result, "name")!;
    expect(f.classification).toBe("CONFLICT");
    expect(f.currentValue).toBe("Godrej Sky Shore");
    expect(f.proposedValue).toBe("A Totally Different Name");
  });

  it("7. no source value for a field -> MISSING, whether or not it's currently blank", () => {
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, {}, { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" });
    expect(byKey(result, "brochure")!.classification).toBe("MISSING");
    expect(byKey(result, "reraStatus")!.classification).toBe("MISSING");
  });

  it("8. no fabrication across a full run with zero facts provided", () => {
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, {}, { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" });
    for (const f of result) {
      expect(f.classification).toBe("MISSING");
      expect(f.proposedValue).toBeNull();
    }
  });

  it("15. reuses the existing 44-field registry exactly -- same field count, same keys, no second registry", () => {
    const completeness = buildProjectReviewCompleteness(GODREJ_PAYLOAD, CONTEXT);
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, {}, { url: "https://example.com", tier: "OFFICIAL_DEVELOPER" });
    expect(result).toHaveLength(44);
    expect(result).toHaveLength(completeness.totalFields);
    const registryKeys = completeness.groups.flatMap((g) => g.fields.map((f) => f.key)).sort();
    const enrichmentKeys = result.map((f) => f.key).sort();
    expect(enrichmentKeys).toEqual(registryKeys);
  });
});

describe("mergeEnrichmentResults — source priority (5, 6. multiple sources / source priority)", () => {
  it("6. a higher-tier source's finding wins over a lower-tier source's finding for the same field", () => {
    const govFacts = classifyProjectEnrichment(
      GODREJ_PAYLOAD,
      CONTEXT,
      { reraStatus: { value: "Registered", confidence: "High" } },
      { url: "https://maharera.example", tier: "GOVERNMENT" }
    );
    const portalFacts = classifyProjectEnrichment(
      GODREJ_PAYLOAD,
      CONTEXT,
      { reraStatus: { value: "Unregistered (wrong)", confidence: "Low" } },
      { url: "https://portal.example", tier: "LISTING_PORTAL" }
    );
    const merged = mergeEnrichmentResults([portalFacts, govFacts]); // deliberately listed lower-tier first
    const f = merged.find((m) => m.key === "reraStatus")!;
    expect(f.proposedValue).toBe("Registered");
    expect(f.sourceType).toBe("GOVERNMENT");
  });

  it("5. multiple sources each contributing different fields all surface in the merged result", () => {
    const sourceA = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, { tagline: { value: "A", confidence: "High" } }, {
      url: "https://a.example",
      tier: "OFFICIAL_DEVELOPER",
    });
    const sourceB = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, { landAreaAcres: { value: "1.8 acres", confidence: "Medium", ambiguous: true } }, {
      url: "https://b.example",
      tier: "VERIFIED_THIRD_PARTY",
    });
    const merged = mergeEnrichmentResults([sourceA, sourceB]);
    expect(merged.find((m) => m.key === "tagline")!.classification).toBe("GREEN_NEW");
    expect(merged.find((m) => m.key === "landAreaAcres")!.classification).toBe("YELLOW");
  });
});

describe("Godrej Sky Shore acceptance test (Phase 28 Part L — the 10 named cases)", () => {
  const result = classifyProjectEnrichment(GODREJ_PAYLOAD, CONTEXT, GODREJ_SKY_SHORE_SOURCE_FACTS, GODREJ_SKY_SHORE_SOURCE_META);

  it("9. name difference -> CONFLICT, never silently changed", () => {
    const f = byKey(result, "name")!;
    expect(f.classification).toBe("CONFLICT");
    expect(f.currentValue).toBe("Godrej Sky Shore");
    expect(f.proposedValue).toBe("Godrej Skyshore");
  });

  it("10. possession date difference -> CONFLICT on both month and year", () => {
    const month = byKey(result, "possessionMonth")!;
    const year = byKey(result, "possessionYear")!;
    expect(month.classification).toBe("CONFLICT");
    expect(month.currentValue).toBe("December");
    expect(month.proposedValue).toBe("February");
    expect(year.classification).toBe("CONFLICT");
    expect(year.currentValue).toBe("2031");
    expect(year.proposedValue).toBe("2030");
  });

  it("11. price max ₹11.89 Cr -> GREEN_NEW (single-listing-artifact exception), not CONFLICT", () => {
    const f = byKey(result, "priceMax")!;
    expect(f.classification).toBe("GREEN_NEW");
    expect(f.currentValue).toBe("₹8.40 Cr");
    expect(f.proposedValue).toBe("₹11.89 Cr");
  });

  it("12. address labeled Sales Lounge -> YELLOW", () => {
    const f = byKey(result, "address")!;
    expect(f.classification).toBe("YELLOW");
    expect(f.currentValue).toBeNull();
    expect(f.reason.toLowerCase()).toContain("sales");
  });

  it("13. land area 1.8 acres -> YELLOW", () => {
    const f = byKey(result, "landAreaAcres")!;
    expect(f.classification).toBe("YELLOW");
    expect(f.proposedValue).toBe("1.8 acres");
  });

  it("meta title -> GREEN_NEW", () => {
    expect(byKey(result, "metaTitle")!.classification).toBe("GREEN_NEW");
  });

  it("meta description -> GREEN_NEW", () => {
    expect(byKey(result, "metaDescription")!.classification).toBe("GREEN_NEW");
  });

  it("14. gated brochure (no fact provided) -> MISSING, never auto-submitted or fabricated", () => {
    expect(byKey(result, "brochure")!.classification).toBe("MISSING");
  });

  it("unavailable RERA status -> MISSING", () => {
    expect(byKey(result, "reraStatus")!.classification).toBe("MISSING");
  });

  it("existing, agreeing fields are CONFIRMED, not falsely flagged", () => {
    expect(byKey(result, "developerGroup")!.classification).toBe("CONFIRMED");
    expect(byKey(result, "locality")!.classification).toBe("CONFIRMED");
    expect(byKey(result, "category")!.classification).toBe("CONFIRMED");
  });

  it("amenities: real content found, still routed to YELLOW per Phase 27's own determination", () => {
    expect(byKey(result, "amenities")!.classification).toBe("YELLOW");
  });

  it("total field count is still exactly 44 for the full Godrej run", () => {
    expect(result).toHaveLength(44);
  });
});
