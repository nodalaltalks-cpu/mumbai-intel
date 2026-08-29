import { describe, expect, it } from "vitest";
import {
  computePriceRange,
  normalizeMagicBricksListings,
  normalizePossessionDate,
  normalizeReraId,
} from "./normalizeMagicBricksListings";
import type { MagicBricksListing } from "./types";

/** The two real Adani Linkbay Residences listings from the Phase 10E test run (run mGLtd6etXJwVIsjIa). */
const ADANI_LISTING_1: MagicBricksListing = {
  listing_id: "86171227",
  title: "3BHK Multistorey Apartment for New Property in Adani Linkbay Residences at Andheri West",
  project_name: "Adani Linkbay Residences",
  developer: "Adani Realty & RC Group",
  locality: "Andheri West",
  city: "Mumbai",
  rera_id: "P51800047539, PR1181012501116",
  possession_date: "Oct '28",
  price_inr: 69900000,
  carpet_area_sqft: 1776,
  description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 6.9 Crore(s)",
  url: "https://www.magicbricks.com/propertyDetails-pdpid-4d4235343137323231",
  latitude: 19.1373697481266,
  longitude: 72.8257229439874,
};

const ADANI_LISTING_2: MagicBricksListing = {
  listing_id: "85827069",
  project_name: "Adani Linkbay Residences",
  developer: "Adani Realty & RC Group",
  locality: "Andheri West",
  rera_id: "P51800047539, PR1181012501116",
  possession_date: "Oct '28",
  price_inr: 44608000,
  carpet_area_sqft: 1394,
  latitude: 19.1373697481266,
  longitude: 72.8257229439874,
};

const GURUKRUPA_LISTING: MagicBricksListing = {
  listing_id: "86008141",
  project_name: "Gurukrupa Ekam",
  developer: "Gurukrupa Realcon",
  locality: "Andheri West",
  rera_id: "PM1180002501525",
  possession_date: "Apr '29",
  price_inr: 32600000,
};

describe("normalizeMagicBricksListings — grouping (Part C)", () => {
  it("TEST 1: two Adani Linkbay Residences listings -> one project candidate", () => {
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, ADANI_LISTING_2], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].row.name).toBe("Adani Linkbay Residences");
    expect(result.candidates[0].meta.listingCount).toBe(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it("TEST 2: different project names -> separate candidates", () => {
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, GURUKRUPA_LISTING], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(2);
    const names = result.candidates.map((c) => c.row.name).sort();
    expect(names).toEqual(["Adani Linkbay Residences", "Gurukrupa Ekam"]);
  });

  it("TEST 3: same project + same locality + same RERA -> grouped", () => {
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, ADANI_LISTING_2], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].row.rera).toBe("P51800047539");
  });

  it("TEST 4: same project + different RERA -> conflict, no silent merge", () => {
    const conflicting: MagicBricksListing = { ...ADANI_LISTING_2, rera_id: "P99999999999" };
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, conflicting], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].type).toBe("RERA_MISMATCH");
    expect(result.conflicts[0].listings).toHaveLength(2);
  });

  it("TEST 5: multiple developers -> no silent merge", () => {
    const otherDeveloper: MagicBricksListing = { ...ADANI_LISTING_2, developer: "Some Other Builder Pvt Ltd", rera_id: undefined };
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, otherDeveloper], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].type).toBe("DEVELOPER_MISMATCH");
  });

  it("TEST 6: missing RERA -> falls back to name + locality grouping", () => {
    const noRera: MagicBricksListing = { ...GURUKRUPA_LISTING, rera_id: undefined };
    const result = normalizeMagicBricksListings([noRera], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].row.rera).toBeUndefined();
    expect(result.candidates[0].flags).toContain("RERA_MISSING");
  });

  it("TEST 7: missing project_name -> unresolved candidate, not merged anywhere", () => {
    const noName: MagicBricksListing = { ...GURUKRUPA_LISTING, project_name: undefined };
    const result = normalizeMagicBricksListings([noName], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toBe("PROJECT_NAME_MISSING");
  });

  it("missing locality -> unresolved candidate, not merged anywhere", () => {
    const noLocality: MagicBricksListing = { ...GURUKRUPA_LISTING, locality: undefined };
    const result = normalizeMagicBricksListings([noLocality], { filterAvailability: "under-construction" });
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toBe("LOCALITY_MISSING");
  });

  it("rule 4: same RERA under a different project name -> flagged, never merged", () => {
    const sameReraDifferentName: MagicBricksListing = {
      ...GURUKRUPA_LISTING,
      project_name: "Some Other Project",
      rera_id: "P51800047539", // matches Adani's first RERA value
    };
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, ADANI_LISTING_2, sameReraDifferentName], {
      filterAvailability: "under-construction",
    });
    expect(result.candidates).toHaveLength(2); // still two separate candidates -- never merged
    for (const candidate of result.candidates) {
      expect(candidate.flags).toContain("RERA_CROSS_PROJECT_CONFLICT");
    }
  });
});

describe("computePriceRange (Part D)", () => {
  it("TEST 8: real Adani prices ₹6.99 Cr and ₹4.46 Cr -> correct min/max", () => {
    const { priceMinRupees, priceMaxRupees, flag } = computePriceRange([ADANI_LISTING_1, ADANI_LISTING_2]);
    expect(priceMinRupees).toBe(44608000);
    expect(priceMaxRupees).toBe(69900000);
    expect(flag).toBeUndefined();
  });

  it("TEST 9: single listing -> min === max, SINGLE_LISTING_PRICE flag", () => {
    const { priceMinRupees, priceMaxRupees, flag } = computePriceRange([GURUKRUPA_LISTING]);
    expect(priceMinRupees).toBe(32600000);
    expect(priceMaxRupees).toBe(32600000);
    expect(flag).toBe("SINGLE_LISTING_PRICE");
  });

  it("never parses price_display -- only price_inr is used", () => {
    const listing: MagicBricksListing = { price_inr: 100, price_display: "999 Cr" };
    const { priceMinRupees, priceMaxRupees } = computePriceRange([listing]);
    expect(priceMinRupees).toBe(100);
    expect(priceMaxRupees).toBe(100);
  });
});

describe("normalizePossessionDate (Part F)", () => {
  it("TEST 10: \"Oct '28\" -> 2028-10-01", () => {
    expect(normalizePossessionDate("Oct '28")).toEqual({ iso: "2028-10-01" });
  });

  it("TEST 11: malformed possession date -> null + POSSESSION_PARSE_FAILED", () => {
    expect(normalizePossessionDate("Sometime next year")).toEqual({ iso: null, flag: "POSSESSION_PARSE_FAILED" });
  });

  it("missing value -> null + POSSESSION_MISSING", () => {
    expect(normalizePossessionDate(undefined)).toEqual({ iso: null, flag: "POSSESSION_MISSING" });
    expect(normalizePossessionDate("")).toEqual({ iso: null, flag: "POSSESSION_MISSING" });
  });

  it("handles extra whitespace and different capitalization", () => {
    expect(normalizePossessionDate("  dec  29 ")).toEqual({ iso: "2029-12-01" });
    expect(normalizePossessionDate("APR'27")).toEqual({ iso: "2027-04-01" });
  });

  it("handles a 4-digit year and a full month name", () => {
    expect(normalizePossessionDate("December 2031")).toEqual({ iso: "2031-12-01" });
  });

  it("passes through an already-valid ISO date unchanged", () => {
    expect(normalizePossessionDate("2028-10-01")).toEqual({ iso: "2028-10-01" });
  });

  it("never invents a day beyond the first-of-month convention", () => {
    const { iso } = normalizePossessionDate("Oct '28");
    expect(iso).toMatch(/-01$/);
  });
});

describe("normalizeReraId (Part E)", () => {
  it("TEST 12: single clean RERA value", () => {
    expect(normalizeReraId("PM1180002501525")).toEqual({ reraNumber: "PM1180002501525" });
  });

  it("TEST 13: two RERAs -> first value used, MULTIPLE_RERA_VALUES flag, raw value preserved", () => {
    const result = normalizeReraId("P51800047539, PR1181012501116");
    expect(result.reraNumber).toBe("P51800047539");
    expect(result.flag).toBe("MULTIPLE_RERA_VALUES");
    expect(result.rawValue).toBe("P51800047539, PR1181012501116");
  });

  it("missing RERA -> RERA_MISSING flag, no fabricated value", () => {
    expect(normalizeReraId(undefined)).toEqual({ flag: "RERA_MISSING" });
    expect(normalizeReraId("   ")).toEqual({ flag: "RERA_MISSING" });
  });
});

describe("basic field normalization (Part G)", () => {
  it("TEST 14: developer trailing whitespace is trimmed", () => {
    const listing: MagicBricksListing = { ...GURUKRUPA_LISTING, developer: "Labharti Realties " };
    const result = normalizeMagicBricksListings([listing], { filterAvailability: "under-construction" });
    expect(result.candidates[0].row.developer).toBe("Labharti Realties");
  });

  it("TEST 15: locality \"Andheri West\" remains \"Andheri West\"", () => {
    const result = normalizeMagicBricksListings([GURUKRUPA_LISTING], { filterAvailability: "under-construction" });
    expect(result.candidates[0].row.locality).toBe("Andheri West");
  });

  it("TEST 16: coordinates are never populated into the canonical row", () => {
    const result = normalizeMagicBricksListings([ADANI_LISTING_1, ADANI_LISTING_2], { filterAvailability: "under-construction" });
    const row = result.candidates[0].row as unknown as Record<string, unknown>;
    expect(row.latitude).toBeUndefined();
    expect(row.longitude).toBeUndefined();
    expect(result.candidates[0].flags).toContain("COORDINATES_UNTRUSTED");
  });

  it("status is always FILTER_DERIVED, mapped from the input filter, never read from listing data", () => {
    const result = normalizeMagicBricksListings([GURUKRUPA_LISTING], { filterAvailability: "ready-to-move" });
    expect(result.candidates[0].row.status).toBe("Ready to Move");
    expect(result.candidates[0].flags).toContain("STATUS_FILTER_DERIVED");
  });

  it("does not invent address, launchDate, totalUnits, or totalTowers", () => {
    const result = normalizeMagicBricksListings([ADANI_LISTING_1], { filterAvailability: "under-construction" });
    const row = result.candidates[0].row as unknown as Record<string, unknown>;
    expect(row.address).toBeUndefined();
    expect(row.launchDate).toBeUndefined();
    expect(row.totalUnits).toBeUndefined();
    expect(row.totalTowers).toBeUndefined();
  });

  it("flags a project with no developer at all as DEVELOPER_MISSING", () => {
    const noDeveloper: MagicBricksListing = { ...GURUKRUPA_LISTING, developer: undefined };
    const result = normalizeMagicBricksListings([noDeveloper], { filterAvailability: "under-construction" });
    expect(result.candidates[0].row.developer).toBeUndefined();
    expect(result.candidates[0].flags).toContain("DEVELOPER_MISSING");
  });
});
