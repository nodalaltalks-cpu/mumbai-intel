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
});
