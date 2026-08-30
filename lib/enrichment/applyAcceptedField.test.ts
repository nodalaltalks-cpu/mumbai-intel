import { describe, expect, it } from "vitest";
import { applyAcceptedField } from "./applyAcceptedField";

const BASE_PAYLOAD = {
  name: "Godrej Sky Shore",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  localityId: "loc-andheri",
  developerGroup: "Godrej Properties Ltd.",
  priceMinRupees: 84000000,
  priceMaxRupees: 84000000,
  possessionDateIso: "2031-12-01T00:00:00.000Z",
};

describe("applyAcceptedField (Phase 32 Part E) — direct string fields", () => {
  it("accepts a simple string field verbatim", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "name", "Godrej Skyshore");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.name).toBe("Godrej Skyshore");
  });

  it("maps a registry key to a differently-named payload key (coverImage -> coverImageUrl)", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "coverImage", "https://example.com/cover.webp");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.coverImageUrl).toBe("https://example.com/cover.webp");
      expect(result.payload.coverImage).toBeUndefined();
    }
  });

  it("maps brochure -> brochureUrl and microMarket -> microMarketId", () => {
    const brochureResult = applyAcceptedField(BASE_PAYLOAD, "brochure", "https://example.com/b.pdf");
    if (brochureResult.ok) expect(brochureResult.payload.brochureUrl).toBe("https://example.com/b.pdf");
    const microResult = applyAcceptedField(BASE_PAYLOAD, "microMarket", "Versova, Andheri (W)");
    if (microResult.ok) expect(microResult.payload.microMarketId).toBe("Versova, Andheri (W)");
  });

  it("never mutates the payload object passed in", () => {
    const original = { ...BASE_PAYLOAD };
    applyAcceptedField(BASE_PAYLOAD, "name", "Something else");
    expect(BASE_PAYLOAD).toEqual(original);
  });

  it("rejects a blank/empty proposed value", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "name", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no proposed value");
  });

  it("rejects a field key that cannot be safely accepted (locality is a foreign key, builder is a foreign key, slug is auto-derived, description has its own documented exception)", () => {
    for (const key of ["locality", "builder", "slug", "description", "dataSource", "sourceRef", "launchDate"]) {
      const result = applyAcceptedField(BASE_PAYLOAD, key, "some value");
      expect(result.ok).toBe(false);
    }
  });

  it("rejects an entirely unknown/invalid field key", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "totallyMadeUpField", "x");
    expect(result.ok).toBe(false);
  });
});

describe("applyAcceptedField — enum fields (status/category)", () => {
  it("reverse-maps a status label to its enum key", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "status", "Ready to Move");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.status).toBe("READY_TO_MOVE");
  });

  it("reverse-maps a category label to its enum key", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "category", "Commercial");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.category).toBe("COMMERCIAL");
  });

  it("rejects an unrecognized status/category label rather than guessing", () => {
    expect(applyAcceptedField(BASE_PAYLOAD, "status", "Sold Out Forever").ok).toBe(false);
    expect(applyAcceptedField(BASE_PAYLOAD, "category", "Industrial").ok).toBe(false);
  });
});

describe("applyAcceptedField — currency fields (priceMin/priceMax)", () => {
  it("parses a Crore-formatted value back into rupees", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMax", "₹11.89 Cr");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.priceMaxRupees).toBe(118900000);
  });

  it("parses a Lakh-formatted value back into rupees", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMin", "₹45.00 L");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.priceMinRupees).toBe(4500000);
  });

  it("rejects a price string it doesn't recognize rather than guessing a number", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMax", "Contact sales for pricing");
    expect(result.ok).toBe(false);
  });
});

describe("applyAcceptedField — plain numeric fields", () => {
  it("parses latitude/longitude", () => {
    const lat = applyAcceptedField(BASE_PAYLOAD, "latitude", "19.133261");
    if (lat.ok) expect(lat.payload.latitude).toBe(19.133261);
    const lng = applyAcceptedField(BASE_PAYLOAD, "longitude", "72.8164585");
    if (lng.ok) expect(lng.payload.longitude).toBe(72.8164585);
  });

  it("parses totalUnits/totalTowers", () => {
    const units = applyAcceptedField(BASE_PAYLOAD, "totalUnits", "312");
    if (units.ok) expect(units.payload.totalUnits).toBe(312);
  });

  it("parses a percentage field", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "constructionPercent", "45%");
    if (result.ok) expect(result.payload.constructionPercent).toBe(45);
  });

  it("parses a land-area field", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "landAreaAcres", "2.5 acres");
    if (result.ok) expect(result.payload.landAreaAcres).toBe(2.5);
  });

  it("rejects a non-numeric value for a numeric field", () => {
    expect(applyAcceptedField(BASE_PAYLOAD, "latitude", "somewhere near the coast").ok).toBe(false);
  });
});

describe("applyAcceptedField — array-shaped count fields", () => {
  it("stores the real items array when the source provided one", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "amenities", "3 selected", ["Squash Court", "Library", "Gym"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.amenities).toEqual(["Squash Court", "Library", "Gym"]);
  });

  it("wraps the display string as a single-item array when no real item list exists, rather than fabricating entries", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "highlights", "A shoreline sanctuary...");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.highlights).toEqual(["A shoreline sanctuary..."]);
  });
});

describe("applyAcceptedField — possession month/year (derived from a single possessionDateIso)", () => {
  it("accepts a new possession month, keeping the existing year", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "possessionMonth", "February");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.possessionDateIso).toBe(new Date(Date.UTC(2031, 1, 1)).toISOString());
  });

  it("accepts a new possession year, keeping the existing month", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "possessionYear", "2030");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.possessionDateIso).toBe(new Date(Date.UTC(2030, 11, 1)).toISOString());
  });

  it("accepting month then year in sequence correctly combines into February 2030", () => {
    const afterMonth = applyAcceptedField(BASE_PAYLOAD, "possessionMonth", "February");
    expect(afterMonth.ok).toBe(true);
    if (!afterMonth.ok) return;
    const afterYear = applyAcceptedField(afterMonth.payload, "possessionYear", "2030");
    expect(afterYear.ok).toBe(true);
    if (afterYear.ok) expect(afterYear.payload.possessionDateIso).toBe(new Date(Date.UTC(2030, 1, 1)).toISOString());
  });

  it("rejects an unrecognized month name", () => {
    expect(applyAcceptedField(BASE_PAYLOAD, "possessionMonth", "Smarch").ok).toBe(false);
  });

  it("rejects possessionMonth when there is no existing possession date to borrow a year from", () => {
    const { possessionDateIso: _drop, ...withoutDate } = BASE_PAYLOAD;
    void _drop;
    const result = applyAcceptedField(withoutDate, "possessionMonth", "February");
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range year", () => {
    expect(applyAcceptedField(BASE_PAYLOAD, "possessionYear", "1500").ok).toBe(false);
  });
});
