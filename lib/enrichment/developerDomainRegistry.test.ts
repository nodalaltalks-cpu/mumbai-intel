import { describe, expect, it } from "vitest";
import { resolveDeveloperDomain } from "./developerDomainRegistry";

describe("resolveDeveloperDomain (Phase 28 Part E — curated, never guessed)", () => {
  it("resolves a known, curated developer", () => {
    expect(resolveDeveloperDomain("Godrej Properties Ltd.")).toBe("https://www.godrejproperties.com");
  });

  it("is case/whitespace insensitive", () => {
    expect(resolveDeveloperDomain("  godrej PROPERTIES ltd.  ")).toBe("https://www.godrejproperties.com");
  });

  it("returns null for an unknown developer rather than guessing a domain", () => {
    expect(resolveDeveloperDomain("Some Random Builder Nobody Verified")).toBeNull();
  });

  it("returns null for blank/undefined input", () => {
    expect(resolveDeveloperDomain(undefined)).toBeNull();
    expect(resolveDeveloperDomain("")).toBeNull();
  });

  it("Phase 41 — resolves the three developers newly curated from bulk Andheri West discovery", () => {
    expect(resolveDeveloperDomain("Puravankara Limited")).toBe("https://www.puravankara.com");
    expect(resolveDeveloperDomain("Platinum Corp")).toBe("https://www.platinumcorp.in");
    expect(resolveDeveloperDomain("Lodha")).toBe("https://www.lodhagroup.com");
  });

  it("Phase 47 — resolves Oberoi Realty, the seventh curated developer", () => {
    expect(resolveDeveloperDomain("Oberoi Realty")).toBe("https://www.oberoirealty.com");
  });

  it("Phase 47 — resolves Kolte Patil, the eighth curated developer", () => {
    expect(resolveDeveloperDomain("Kolte Patil Developers Ltd.")).toBe("https://www.koltepatil.com");
  });

  it("Phase 48 — resolves Runwal Realty, the ninth curated developer", () => {
    expect(resolveDeveloperDomain("Runwal Realty")).toBe("https://runwalrealty.com");
    expect(resolveDeveloperDomain("Runwal")).toBe("https://runwalrealty.com");
  });

  it("Phase 49 — resolves Rustomjee, the tenth curated developer", () => {
    expect(resolveDeveloperDomain("Rustomjee")).toBe("https://www.rustomjee.com");
    expect(resolveDeveloperDomain("Keystone Realtors")).toBe("https://www.rustomjee.com");
  });

  it("Phase 52 — resolves Sunteck Realty, the eleventh curated developer (sunteckindia.com, NOT the unrelated same-named IT firm)", () => {
    expect(resolveDeveloperDomain("Sunteck Realty")).toBe("https://www.sunteckindia.com");
    expect(resolveDeveloperDomain("Sunteck")).toBe("https://www.sunteckindia.com");
  });

  it("Phase 53 — resolves Shapoorji Pallonji Real Estate, the twelfth curated developer", () => {
    expect(resolveDeveloperDomain("Shapoorji Pallonji Real Estate")).toBe("https://shapoorjirealestate.com");
    expect(resolveDeveloperDomain("Shapoorji Pallonji")).toBe("https://shapoorjirealestate.com");
  });

  it("Phase 54 — resolves Piramal Realty, the thirteenth curated developer", () => {
    expect(resolveDeveloperDomain("Piramal Realty")).toBe("https://www.piramalrealty.com");
    expect(resolveDeveloperDomain("Piramal")).toBe("https://www.piramalrealty.com");
  });

  it("Phase 55 — resolves the 7 developers newly curated for the automated-discovery MVP", () => {
    expect(resolveDeveloperDomain("L&T Realty")).toBe("https://www.lntrealty.com");
    expect(resolveDeveloperDomain("House of Hiranandani")).toBe("https://www.houseofhiranandani.com");
    expect(resolveDeveloperDomain("Chandak Group")).toBe("https://www.chandakgroup.com");
    expect(resolveDeveloperDomain("Kanakia Group")).toBe("https://www.kanakia.com");
    expect(resolveDeveloperDomain("MICL Group")).toBe("https://www.micl.com");
    expect(resolveDeveloperDomain("Mahindra Lifespace Developers")).toBe("https://www.mahindralifespaces.com");
    expect(resolveDeveloperDomain("JP Infra")).toBe("https://www.jpinfra.com");
  });

  it("Phase 55 — deliberately does NOT resolve bare 'Hiranandani', which real research found genuinely ambiguous between multiple separate companies", () => {
    expect(resolveDeveloperDomain("Hiranandani")).toBeNull();
    expect(resolveDeveloperDomain("Hiranandani Group")).toBeNull();
  });
});
