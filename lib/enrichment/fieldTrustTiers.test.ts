import { describe, expect, it } from "vitest";
import { getFieldTrustTier, PROTECTED_IDENTITY_FIELDS, UNSUPPORTED_FOR_AUTO_ACCEPT } from "./fieldTrustTiers";

describe("fieldTrustTiers", () => {
  it("1. Tier A contains only the narrow, highly-structured v1 fields", () => {
    expect(getFieldTrustTier("reraNumber")).toBe("A");
    expect(getFieldTrustTier("reraStatus")).toBe("A");
    expect(getFieldTrustTier("priceMin")).toBe("A");
    expect(getFieldTrustTier("priceMax")).toBe("A");
  });

  it("2. Tier B contains the contextual/structured fields Phase 60 keeps at human review for v1", () => {
    for (const key of ["locality", "address", "possessionMonth", "possessionYear", "constructionPercent", "landAreaAcres", "latitude", "longitude", "googleMapsUrl", "status", "category"]) {
      expect(getFieldTrustTier(key)).toBe("B");
    }
  });

  it("3. Tier C contains editorial/semantic fields", () => {
    for (const key of ["tagline", "highlights", "description", "amenities", "metaTitle"]) {
      expect(getFieldTrustTier(key)).toBe("C");
    }
  });

  it("4. Tier D contains media fields", () => {
    for (const key of ["coverImage", "images", "videoUrl", "tour360Url", "brochure", "documents", "ogImageUrl"]) {
      expect(getFieldTrustTier(key)).toBe("D");
    }
  });

  it("5. name/developerGroup/builder have no tier entry — they are protected or write-unsupported, never tiered", () => {
    expect(getFieldTrustTier("name")).toBeNull();
    expect(getFieldTrustTier("developerGroup")).toBeNull();
    expect(getFieldTrustTier("builder")).toBeNull();
  });

  it("6. an unknown field key returns null rather than guessing", () => {
    expect(getFieldTrustTier("someMadeUpField")).toBeNull();
  });

  it("7. PROTECTED_IDENTITY_FIELDS is exactly name/developerGroup/locality", () => {
    expect([...PROTECTED_IDENTITY_FIELDS].sort()).toEqual(["developerGroup", "locality", "name"]);
  });

  it("8. UNSUPPORTED_FOR_AUTO_ACCEPT matches applyAcceptedField's own documented exclusions", () => {
    for (const key of ["builder", "slug", "locality", "description", "launchDate"]) {
      expect(UNSUPPORTED_FOR_AUTO_ACCEPT.has(key)).toBe(true);
    }
  });
});
