import { describe, expect, it } from "vitest";
import { resolveSavedDeveloperWebsite, normalizeWebsiteUrl, type BuilderForWebsiteLookup } from "./developerWebsite";

const GODREJ: BuilderForWebsiteLookup = {
  id: "builder-godrej",
  name: "Godrej Properties",
  legalNames: ["Godrej Properties Ltd.", "Godrej Properties Limited"],
  reraNumber: null,
  websiteUrl: "https://www.godrejproperties.com",
};

const LODHA_NO_WEBSITE: BuilderForWebsiteLookup = {
  id: "builder-lodha",
  name: "Lodha",
  legalNames: ["Macrotech Developers"],
  reraNumber: null,
  websiteUrl: null,
};

const BUILDERS = [GODREJ, LODHA_NO_WEBSITE];

describe("resolveSavedDeveloperWebsite", () => {
  it("finds the saved website for an exact developer-name match", () => {
    const result = resolveSavedDeveloperWebsite("Godrej Properties", BUILDERS);
    expect(result).toEqual({ builderId: "builder-godrej", builderName: "Godrej Properties", websiteUrl: "https://www.godrejproperties.com" });
  });

  it("finds the same saved website via a legalName alias — the same developer discovered under a different staged name still reuses it (Requirement 12: same developer, different project)", () => {
    const result = resolveSavedDeveloperWebsite("Godrej Properties Ltd.", BUILDERS);
    expect(result?.websiteUrl).toBe("https://www.godrejproperties.com");
    expect(result?.builderId).toBe("builder-godrej");
  });

  it("reuses the identical saved website across two unrelated candidates for the same developer (Requirement 4/12)", () => {
    const firstProjectLookup = resolveSavedDeveloperWebsite("Godrej Properties", BUILDERS);
    const secondProjectLookup = resolveSavedDeveloperWebsite("Godrej Properties", BUILDERS);
    expect(firstProjectLookup?.websiteUrl).toBe(secondProjectLookup?.websiteUrl);
    expect(firstProjectLookup?.builderId).toBe(secondProjectLookup?.builderId);
  });

  it("reports a Builder with no saved website as null websiteUrl, not a missing match (Requirement 9)", () => {
    const result = resolveSavedDeveloperWebsite("Lodha", BUILDERS);
    expect(result).toEqual({ builderId: "builder-lodha", builderName: "Lodha", websiteUrl: null });
  });

  it("never reuses a different developer's website for a merely similar-looking name (Requirement 5 — no accidental cross-developer reuse)", () => {
    // "Godrej" alone is NOT an exact match for "Godrej Properties" or any of its
    // legalNames — only a fuzzy/partial similarity, which must NOT be trusted
    // to hand back Godrej's saved website for a possibly-unrelated developer.
    const result = resolveSavedDeveloperWebsite("Godrej", BUILDERS);
    expect(result).toBeNull();
  });

  it("returns null for a developer with no matching Builder record at all", () => {
    const result = resolveSavedDeveloperWebsite("Unknown (via Housiey)", BUILDERS);
    expect(result).toBeNull();
  });
});

describe("normalizeWebsiteUrl", () => {
  it("accepts a valid https URL unchanged", () => {
    expect(normalizeWebsiteUrl("https://www.godrejproperties.com")).toBe("https://www.godrejproperties.com");
  });

  it("accepts a valid http URL", () => {
    expect(normalizeWebsiteUrl("http://example.com")).toBe("http://example.com");
  });

  it("normalizes a trailing slash away consistently, regardless of whether the founder typed one", () => {
    expect(normalizeWebsiteUrl("https://www.godrejproperties.com/")).toBe("https://www.godrejproperties.com");
    expect(normalizeWebsiteUrl("https://www.godrejproperties.com")).toBe("https://www.godrejproperties.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeWebsiteUrl("  https://www.godrejproperties.com  ")).toBe("https://www.godrejproperties.com");
  });

  it("rejects an obviously invalid, non-URL string", () => {
    expect(normalizeWebsiteUrl("not a url")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeWebsiteUrl("   ")).toBeNull();
  });

  it("rejects a non-http(s) scheme (e.g. javascript:)", () => {
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a non-http(s) scheme (e.g. ftp:)", () => {
    expect(normalizeWebsiteUrl("ftp://files.example.com")).toBeNull();
  });
});
