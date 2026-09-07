import { describe, expect, it } from "vitest";
import { applyAcceptedField, getFieldEditorKind, isFieldManuallyEditable, validateProposedEdit } from "./applyAcceptedField";

const BASE_PAYLOAD = {
  name: "Godrej Sky Shore",
  status: "UNDER_CONSTRUCTION",
  category: "RESIDENTIAL",
  localityId: "loc-andheri",
  developerGroup: "Godrej Properties Ltd.",
  priceMinRupees: 84000000,
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

  it("rejects a field key that cannot be safely accepted (locality/builder are foreign keys, dataSource/sourceRef describe the staging record's own origin)", () => {
    for (const key of ["locality", "builder", "dataSource", "sourceRef"]) {
      const result = applyAcceptedField(BASE_PAYLOAD, key, "some value");
      expect(result.ok).toBe(false);
    }
  });

  it("accepts description directly -- Phase 67 moved this out of the excluded set", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "description", "A richer, founder-authored description.");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.description).toBe("A richer, founder-authored description.");
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

describe("applyAcceptedField — currency field (priceMin)", () => {
  it("parses a Crore-formatted value back into rupees", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMin", "₹11.89 Cr");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.priceMinRupees).toBe(118900000);
  });

  it("parses a Lakh-formatted value back into rupees", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMin", "₹45.00 L");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.priceMinRupees).toBe(4500000);
  });

  it("rejects a price string it doesn't recognize rather than guessing a number", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "priceMin", "Contact sales for pricing");
    expect(result.ok).toBe(false);
  });
});

describe("applyAcceptedField — launch date", () => {
  it("parses a YYYY-MM-DD value into launchDateIso", () => {
    const result = applyAcceptedField(BASE_PAYLOAD, "launchDate", "2027-03-15");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.launchDateIso).toBe(new Date("2027-03-15T00:00:00.000Z").toISOString());
  });

  it("rejects a non-YYYY-MM-DD date string rather than guessing a locale", () => {
    expect(applyAcceptedField(BASE_PAYLOAD, "launchDate", "15/03/2027").ok).toBe(false);
    expect(applyAcceptedField(BASE_PAYLOAD, "launchDate", "March 2027").ok).toBe(false);
  });
});

describe("applyAcceptedField — plain numeric fields", () => {
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
    expect(applyAcceptedField(BASE_PAYLOAD, "totalUnits", "quite a lot").ok).toBe(false);
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

  it("I. amenities: no artificial maximum -- a 30+ item list (add/remove already exercised via the SAME array mechanism paymentPlans reuses below) saves in full, none dropped", () => {
    const manyAmenities = Array.from({ length: 34 }, (_, i) => `Amenity ${i + 1}`);
    const result = applyAcceptedField(BASE_PAYLOAD, "amenities", "34 selected", manyAmenities);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.amenities).toHaveLength(34);
  });

  describe("paymentPlans (targeted fix, founder-testing round — the founder can add/edit/remove multiple plans, same array mechanism as amenities/highlights)", () => {
    it("G. a single plan saves as a one-item array", () => {
      const result = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "1 plan(s) listed", ["Construction Linked Plan: 10:80:10"]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.paymentPlans).toEqual(["Construction Linked Plan: 10:80:10"]);
    });

    it("G2. multiple plans save as a multi-item array, in the founder's own order", () => {
      const plans = ["Construction Linked Plan: 10:80:10", "Down Payment Plan: 5% discount", "Flexi Payment Plan: 30:70"];
      const result = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "3 plan(s) listed", plans);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.paymentPlans).toEqual(plans);
    });

    it("H. editing (re-accepting with a changed list) replaces the array wholesale -- the previous set of plans is not merged with the new one", () => {
      const original = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "2 plan(s) listed", ["Plan A", "Plan B"]);
      if (!original.ok) throw new Error("expected ok");
      const edited = applyAcceptedField(original.payload, "paymentPlans", "2 plan(s) listed", ["Plan A (revised)", "Plan C"]);
      expect(edited.ok).toBe(true);
      if (edited.ok) expect(edited.payload.paymentPlans).toEqual(["Plan A (revised)", "Plan C"]);
    });

    it("H2. removing a plan (re-accepting with fewer items) shrinks the array -- a removed plan never lingers", () => {
      const original = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "3 plan(s) listed", ["Plan A", "Plan B", "Plan C"]);
      if (!original.ok) throw new Error("expected ok");
      const afterRemoval = applyAcceptedField(original.payload, "paymentPlans", "2 plan(s) listed", ["Plan A", "Plan C"]);
      expect(afterRemoval.ok).toBe(true);
      if (afterRemoval.ok) expect(afterRemoval.payload.paymentPlans).toEqual(["Plan A", "Plan C"]);
    });

    it("no artificial maximum -- 30+ plans save without truncation", () => {
      const manyPlans = Array.from({ length: 32 }, (_, i) => `Plan ${i + 1}`);
      const result = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "32 plan(s) listed", manyPlans);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.paymentPlans).toHaveLength(32);
    });

    it("is manually editable (founder can type a plan from scratch when the field is currently MISSING), with its own structured editor kind -- not the generic flat-string array editor", () => {
      expect(isFieldManuallyEditable("paymentPlans")).toBe(true);
      expect(getFieldEditorKind("paymentPlans", 0)).toBe("payment-plan-list");
    });

    it("empty plans: an empty items list falls back to the display value rather than silently discarding the field (same convention as every other array field -- the UI's own Save Edit already refuses to save a fully-empty list before this is ever reached)", () => {
      const result = applyAcceptedField(BASE_PAYLOAD, "paymentPlans", "Plan text", []);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.paymentPlans).toEqual(["Plan text"]);
    });
  });

  describe("slug (targeted fix, Slug editability — KEPT, no longer excluded)", () => {
    it("E. accepts a founder-typed slug, normalized through the same slugify() every other slug in this codebase uses", () => {
      const result = applyAcceptedField(BASE_PAYLOAD, "slug", "Godrej Sky Shore Phase 2!");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.slug).toBe("godrej-sky-shore-phase-2");
    });

    it("a value that normalizes to nothing (e.g. pure punctuation) is rejected, never stored as an empty slug", () => {
      const result = applyAcceptedField(BASE_PAYLOAD, "slug", "###");
      expect(result.ok).toBe(false);
    });

    it("never checks live database uniqueness here -- this function stays synchronous and DB-free; ensureUniqueSlug at approval time is the sole authority", () => {
      const result = applyAcceptedField(BASE_PAYLOAD, "slug", "some-other-projects-exact-slug");
      expect(result.ok).toBe(true);
    });

    it("is manually editable, with the plain text editor kind (a slug is always short)", () => {
      expect(isFieldManuallyEditable("slug")).toBe(true);
      expect(getFieldEditorKind("slug", 5)).toBe("text");
    });

    it("validateProposedEdit accepts a normalizable slug and rejects one that normalizes to nothing", () => {
      expect(validateProposedEdit("slug", "Linkbay Residences 2").ok).toBe(true);
      expect(validateProposedEdit("slug", "###").ok).toBe(false);
    });
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

describe("validateProposedEdit (Phase 36 — client-safe pre-check before Save Edit, reuses applyAcceptedField's own parsers)", () => {
  it("9. rejects an invalid numeric value", () => {
    expect(validateProposedEdit("totalUnits", "quite a lot").ok).toBe(false);
    expect(validateProposedEdit("landAreaAcres", "a few acres").ok).toBe(false);
    expect(validateProposedEdit("constructionPercent", "almost done").ok).toBe(false);
  });

  it("accepts a valid numeric value in the same format applyAcceptedField itself expects", () => {
    expect(validateProposedEdit("totalUnits", "312").ok).toBe(true);
    expect(validateProposedEdit("landAreaAcres", "2.5 acres").ok).toBe(true);
    expect(validateProposedEdit("constructionPercent", "45%").ok).toBe(true);
    expect(validateProposedEdit("priceMin", "₹11.89 Cr").ok).toBe(true);
  });

  it("validates launchDate as a YYYY-MM-DD date", () => {
    expect(validateProposedEdit("launchDate", "not a date").ok).toBe(false);
    expect(validateProposedEdit("launchDate", "2027-03-15").ok).toBe(true);
  });

  it("10. rejects an invalid enum value for status/category", () => {
    expect(validateProposedEdit("status", "Sold Out Forever").ok).toBe(false);
    expect(validateProposedEdit("category", "Industrial").ok).toBe(false);
  });

  it("accepts a genuinely valid enum label", () => {
    expect(validateProposedEdit("status", "Ready to Move").ok).toBe(true);
    expect(validateProposedEdit("category", "Residential").ok).toBe(true);
  });

  it("11. URL-ish fields follow the existing convention (no strict URL-format check, same as the admin Project form's own schema) -- any non-empty string passes", () => {
    expect(validateProposedEdit("videoUrl", "not a url at all").ok).toBe(true);
    expect(validateProposedEdit("googleMapsUrl", "https://maps.app.goo.gl/abc").ok).toBe(true);
  });

  it("rejects an empty value for any field", () => {
    expect(validateProposedEdit("tagline", "").ok).toBe(false);
    expect(validateProposedEdit("tagline", "   ").ok).toBe(false);
  });

  it("rejects an unrecognized possession month name", () => {
    expect(validateProposedEdit("possessionMonth", "Smarch").ok).toBe(false);
    expect(validateProposedEdit("possessionMonth", "February").ok).toBe(true);
  });

  it("rejects an out-of-range possession year", () => {
    expect(validateProposedEdit("possessionYear", "1500").ok).toBe(false);
    expect(validateProposedEdit("possessionYear", "2030").ok).toBe(true);
  });

  it("a plain string field (tagline, address, etc.) only needs to be non-empty", () => {
    expect(validateProposedEdit("tagline", "A shoreline sanctuary").ok).toBe(true);
    expect(validateProposedEdit("address", "off, Fun Republic, New Link road").ok).toBe(true);
  });
});

describe("isFieldManuallyEditable (Phase 67 — gates the Edit affordance for a currently-MISSING field, not just GREEN_NEW/YELLOW/CONFLICT)", () => {
  it("editable direct-string, array, and special-cased fields all report true", () => {
    for (const key of ["name", "reraNumber", "address", "description", "launchDate", "priceMin", "status", "category", "amenities", "highlights", "slug"]) {
      expect(isFieldManuallyEditable(key)).toBe(true);
    }
  });

  it("relational and staging-origin fields report false -- no Edit affordance for these regardless of classification", () => {
    for (const key of ["locality", "builder", "dataSource", "sourceRef"]) {
      expect(isFieldManuallyEditable(key)).toBe(false);
    }
  });

  it("an unknown field key reports false rather than guessing", () => {
    expect(isFieldManuallyEditable("someMadeUpField")).toBe(false);
  });
});

describe("getFieldEditorKind (Phase 36 — which editor control a field needs)", () => {
  it("12. array-shaped fields get the list editor", () => {
    for (const key of ["highlights", "specifications", "amenities", "faqs", "images", "documents"]) {
      expect(getFieldEditorKind(key, 10)).toBe("array");
    }
  });

  it("enum fields get their own dedicated editor kind", () => {
    expect(getFieldEditorKind("status", 5)).toBe("enum-status");
    expect(getFieldEditorKind("category", 5)).toBe("enum-category");
  });

  it("possessionMonth gets the month editor", () => {
    expect(getFieldEditorKind("possessionMonth", 5)).toBe("month");
  });

  it("launchDate gets the date editor", () => {
    expect(getFieldEditorKind("launchDate", 10)).toBe("date");
  });

  it("a short plain string gets a single-line text input", () => {
    expect(getFieldEditorKind("videoUrl", 40)).toBe("text");
  });

  it("a long plain string gets a textarea", () => {
    expect(getFieldEditorKind("tagline", 200)).toBe("textarea");
  });
});
