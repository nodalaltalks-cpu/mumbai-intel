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
});
