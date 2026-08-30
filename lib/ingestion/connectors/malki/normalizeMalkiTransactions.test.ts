import { describe, expect, it } from "vitest";
import {
  mapMalkiInstrumentToType,
  normalizeMalkiArea,
  normalizeMalkiDate,
  normalizeMalkiTransactions,
  normalizeMalkiValue,
} from "./normalizeMalkiTransactions";
import type { MalkiTransactionRecord } from "./types";

// Fixtures modeled on the REAL Gurukrupa Ekam, Andheri West page structure
// observed in the Phase 21 feasibility test -- values here are synthetic,
// not the actual scraped figures, per Part J ("use mocked data").
const FULL_RECORD: MalkiTransactionRecord = {
  buildingName: "Gurukrupa Ekam",
  locality: "Andheri West",
  date: "27 Jun 2026",
  instrument: "New Agreement For Sale",
  unit: "A Wing-1806",
  carpetSqft: "1,052",
  value: "₹3.69 Cr",
  docRef: "322/11484",
  sourceUrl: "https://malki.in/mumbai/oshiwara/gurukrupa-ekam-bcf001/",
};

describe("normalizeMalkiDate", () => {
  it("5. parses 'DD Mon YYYY' correctly", () => {
    expect(normalizeMalkiDate("27 Jun 2026")).toEqual({ iso: "2026-06-27" });
  });
  it("5. passes through an already-ISO date unchanged", () => {
    expect(normalizeMalkiDate("2026-06-27")).toEqual({ iso: "2026-06-27" });
  });
  it("normalizes single-digit days and extra whitespace", () => {
    expect(normalizeMalkiDate("  5   May  2026 ")).toEqual({ iso: "2026-05-05" });
  });
  it("flags a missing date, never guesses one", () => {
    expect(normalizeMalkiDate(undefined)).toEqual({ iso: null, flag: "DATE_MISSING" });
    expect(normalizeMalkiDate("")).toEqual({ iso: null, flag: "DATE_MISSING" });
  });
  it("flags an unparseable date format, never silently misinterprets it", () => {
    expect(normalizeMalkiDate("27/06/2026")).toEqual({ iso: null, flag: "DATE_UNPARSEABLE" });
    expect(normalizeMalkiDate("sometime in June")).toEqual({ iso: null, flag: "DATE_UNPARSEABLE" });
  });
});

describe("normalizeMalkiValue (6. currency/value normalization)", () => {
  it("parses Crore values", () => {
    expect(normalizeMalkiValue("₹3.69 Cr")).toEqual({ rupees: 36900000 });
  });
  it("parses Lakh values", () => {
    expect(normalizeMalkiValue("₹25 L")).toEqual({ rupees: 2500000 });
  });
  it("passes through an already-numeric rupee value", () => {
    expect(normalizeMalkiValue(2500000)).toEqual({ rupees: 2500000 });
  });
  it("3. flags a missing/undisclosed value ('–') rather than treating it as zero", () => {
    expect(normalizeMalkiValue("–")).toEqual({ rupees: null, flag: "VALUE_MISSING" });
    expect(normalizeMalkiValue(undefined)).toEqual({ rupees: null, flag: "VALUE_MISSING" });
  });
  it("flags a lease's monthly rate as ambiguous rather than treating it as a lump sum", () => {
    expect(normalizeMalkiValue("₹1 L/mo")).toEqual({ rupees: null, flag: "VALUE_AMBIGUOUS_LEASE_RATE" });
  });
  it("15. flags malformed/garbage value text rather than guessing", () => {
    expect(normalizeMalkiValue("TBD")).toEqual({ rupees: null, flag: "VALUE_MISSING" });
    expect(normalizeMalkiValue("N/A")).toEqual({ rupees: null, flag: "VALUE_MISSING" });
  });
});

describe("normalizeMalkiArea (4. missing area)", () => {
  it("strips thousands-separator commas", () => {
    expect(normalizeMalkiArea("1,052")).toEqual({ sqft: 1052 });
  });
  it("passes through an already-numeric area", () => {
    expect(normalizeMalkiArea(814)).toEqual({ sqft: 814 });
  });
  it("flags a missing area, never fabricates one", () => {
    expect(normalizeMalkiArea(undefined)).toEqual({ sqft: null, flag: "AREA_MISSING" });
    expect(normalizeMalkiArea("–")).toEqual({ sqft: null, flag: "AREA_MISSING" });
  });
  it("15. flags an unparseable area rather than guessing", () => {
    expect(normalizeMalkiArea("approx 900 sqft")).toEqual({ sqft: null, flag: "AREA_UNPARSEABLE" });
  });
});

describe("mapMalkiInstrumentToType", () => {
  it("maps the sale-deed family to 'sale'", () => {
    expect(mapMalkiInstrumentToType("Agreement For Sale")).toEqual({ type: "sale" });
    expect(mapMalkiInstrumentToType("New Agreement For Sale")).toEqual({ type: "sale" });
    expect(mapMalkiInstrumentToType("Sale Deed")).toEqual({ type: "sale" });
  });
  it("excludes mortgage/gift/lease instruments rather than guessing a bucket for them", () => {
    expect(mapMalkiInstrumentToType("Mortgage Deed")).toEqual({ type: null, flag: "INSTRUMENT_UNSUPPORTED" });
    expect(mapMalkiInstrumentToType("Gift Deed")).toEqual({ type: null, flag: "INSTRUMENT_UNSUPPORTED" });
    expect(mapMalkiInstrumentToType("Lease Deed")).toEqual({ type: null, flag: "INSTRUMENT_UNSUPPORTED" });
    expect(mapMalkiInstrumentToType("Leave & License")).toEqual({ type: null, flag: "INSTRUMENT_UNSUPPORTED" });
  });
  it("flags a missing instrument", () => {
    expect(mapMalkiInstrumentToType(undefined)).toEqual({ type: null, flag: "INSTRUMENT_MISSING" });
  });
});

describe("normalizeMalkiTransactions — end-to-end (Part J scenarios)", () => {
  it("1. a fully populated record produces exactly one clean candidate", () => {
    const result = normalizeMalkiTransactions([FULL_RECORD]);
    expect(result.unresolved).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const { row, flags } = result.candidates[0];
    expect(row).toEqual({
      locality: "Andheri West",
      project: "Gurukrupa Ekam",
      type: "sale",
      registrationDate: "2026-06-27",
      value: 36900000,
      carpetSqft: 1052,
      unitLabel: "A Wing-1806",
      registrationNumber: "322/11484",
      confidence: "High",
      sourceNote: expect.stringContaining("malki.in/mumbai/oshiwara/gurukrupa-ekam-bcf001"),
    });
    expect(flags).toEqual([]);
  });

  it("2. missing optional fields (project/area/unit) still stages, with Medium confidence and no fabricated values", () => {
    const result = normalizeMalkiTransactions([
      { locality: "Andheri West", date: "27 Jun 2026", instrument: "Agreement For Sale", value: "₹2 Cr", docRef: "111/1" },
    ]);
    expect(result.candidates).toHaveLength(1);
    const { row, flags } = result.candidates[0];
    expect(row.project).toBeUndefined();
    expect(row.carpetSqft).toBeUndefined();
    expect(row.unitLabel).toBeUndefined();
    expect(row.confidence).toBe("Medium");
    expect(flags).toContain("PROJECT_NAME_MISSING");
  });

  it("3. missing transaction value moves the record to unresolved, never staged with a guessed value", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, value: "–" }]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toEqual([{ reason: "VALUE_MISSING", record: { ...FULL_RECORD, value: "–" } }]);
  });

  it("4. missing area does not block staging -- it's optional, just flagged", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, carpetSqft: undefined }]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].row.carpetSqft).toBeUndefined();
    expect(result.candidates[0].flags).toContain("AREA_MISSING");
  });

  it("6. currency normalization is reflected end-to-end in the staged value", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, value: "₹25 L", docRef: "222/2" }]);
    expect(result.candidates[0].row.value).toBe(2500000);
  });

  it("7. whitespace is trimmed from every string field", () => {
    const result = normalizeMalkiTransactions([
      { ...FULL_RECORD, locality: "  Andheri West  ", unit: "  A Wing-1806  ", docRef: "333/3" },
    ]);
    expect(result.candidates[0].row.locality).toBe("Andheri West");
    expect(result.candidates[0].row.unitLabel).toBe("A Wing-1806");
  });

  it("8. locality is passed through trimmed, never invented or resolved by this module", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, locality: " Bandra West ", docRef: "444/4" }]);
    expect(result.candidates[0].row.locality).toBe("Bandra West");
  });

  it("9. registration number is preserved exactly as the strong identifier", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, docRef: "  514/9319  ", value: "₹1 Cr", date: "10 May 2026" }]);
    expect(result.candidates[0].row.registrationNumber).toBe("514/9319");
  });

  it("10. source URL is preserved inside the source note", () => {
    const result = normalizeMalkiTransactions([FULL_RECORD]);
    expect(result.candidates[0].row.sourceNote).toContain(FULL_RECORD.sourceUrl);
  });

  it("11. registration number is the key used for duplicate grouping (case-insensitive)", () => {
    const result = normalizeMalkiTransactions([
      { ...FULL_RECORD, docRef: "abc/123" },
      { ...FULL_RECORD, docRef: "ABC/123", date: "1 Jan 2026" }, // same doc ref, different casing
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved.every((u) => u.reason === "DUPLICATE_DOC_REF_IN_BATCH")).toBe(true);
  });

  it("12. same-batch duplicate registration numbers are flagged, never silently double-staged", () => {
    const result = normalizeMalkiTransactions([
      { ...FULL_RECORD, value: "₹3.69 Cr" },
      { ...FULL_RECORD, value: "₹3.70 Cr" }, // same docRef, slightly different value -- a real data-entry-error shape
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved[0].reason).toBe("DUPLICATE_DOC_REF_IN_BATCH");
  });

  it("distinct registration numbers for the same unit (a legitimate resale) are NOT flagged as duplicates", () => {
    const result = normalizeMalkiTransactions([
      { ...FULL_RECORD, docRef: "322/11484", date: "27 Jun 2026" },
      { ...FULL_RECORD, docRef: "514/9319", date: "10 May 2026", value: "₹3.74 Cr" },
    ]);
    expect(result.candidates).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);
  });

  it("13. an ambiguous/absent project name still stages, flagged, never invented", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, buildingName: undefined, docRef: "555/5" }]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].row.project).toBeUndefined();
    expect(result.candidates[0].flags).toContain("PROJECT_NAME_MISSING");
  });

  it("14. an unknown/blank locality moves the record to unresolved rather than guessing one", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, locality: "", docRef: "666/6" }]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved).toEqual([{ reason: "LOCALITY_MISSING", record: { ...FULL_RECORD, locality: "", docRef: "666/6" } }]);
  });

  it("15. malformed data (unparseable date AND value) fails safely without fabricating either", () => {
    const result = normalizeMalkiTransactions([{ ...FULL_RECORD, date: "sometime", docRef: "777/7" }]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved[0].reason).toBe("DATE_UNPARSEABLE");
  });

  it("16. no field is ever fabricated across a full mixed batch", () => {
    const result = normalizeMalkiTransactions([
      FULL_RECORD,
      { ...FULL_RECORD, docRef: "888/8", value: "–" },
      { ...FULL_RECORD, docRef: "999/9", instrument: "Mortgage Deed" },
      { ...FULL_RECORD, docRef: "", locality: "Andheri West" },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.unresolved).toHaveLength(3);
    for (const u of result.unresolved) {
      expect(["VALUE_MISSING", "INSTRUMENT_UNSUPPORTED", "DOC_REF_MISSING"]).toContain(u.reason);
    }
  });

  it("excludes lease rows (monthly rate is not a lump-sum value) rather than fabricating a total", () => {
    const result = normalizeMalkiTransactions([
      { ...FULL_RECORD, docRef: "aaa/1", instrument: "Leave & License", value: "₹1 L/mo" },
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.unresolved[0].reason).toBe("INSTRUMENT_UNSUPPORTED");
  });
});
