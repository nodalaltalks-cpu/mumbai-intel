import { afterEach, describe, expect, it, vi } from "vitest";
import { godrejPropertiesAdapter, extractGodrejSkyShoreFacts, GODREJ_SKY_SHORE_PROJECT_URL } from "./godrejPropertiesAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of godrej-skyshore's actual markup,
 * captured during Phase 30's live inspection: the same `<title>`/meta
 * description shape (Phase 29), the same six JSON-LD script ids, and the same
 * `__NEXT_DATA__` -> props.pageProps.item key names and nesting this project's
 * real page actually returned (item.location, item.key_usp,
 * item.starting_prices, item.neighbourhood.geolocation_coordinates,
 * item.amenities, item.gallery_image_uploads, item.gallery_video_uploads,
 * item.compliance, item.brochure, item.thumbnail, item.overview,
 * item.rera_details). No selector here was invented -- every key name matches
 * what Phase 30 actually found live.
 */
function buildRealShapedHtml(overrides: { item?: Record<string, unknown>; includeOrgLdJson?: boolean } = {}): string {
  const item = {
    name: "Godrej Skyshore",
    residentialType: "Residential",
    key_usp: "Under Construction",
    location: "Versova, Andheri (W)",
    neighbourhood: {
      address: "Sales Lounge, CTS No. 1165-1172/1-4, Versova, Andheri, Mumbai Suburban 400061",
      google_map_api: "https://maps.app.goo.gl/orpAL4QXpzekw7FaA",
      geolocation_coordinates: { latitude: "19.133261", longitude: "72.8164585" },
      nearByPlaces: [{ name: "International Airport - 18 mins*" }, { name: "Kokilaben Hospital - 5 Mins*" }],
    },
    amenity_body: { document: [{ type: "paragraph", children: [{ text: "Shaping this space with intention." }] }] },
    starting_prices: [
      { name: "3 BHK", minimum_price: 84000000, maximum_price: 84000000 },
      { name: "4 BHK", minimum_price: 118900000, maximum_price: 118900000 },
    ],
    possessionDate: "2030-02-06T18:30:00.000Z",
    overview: {
      document: [{ type: "paragraph", children: [{ text: "A shoreline sanctuary shaped by the timeless dance of earth and sea." }] }],
    },
    amenities: [{ title: "Squash Court" }, { title: "Themed Landscape Garden" }, { title: "Library" }],
    thumbnail: { url: "https://gplwebsitecdnblob.blob.core.windows.net/godrej-cdn/Images/thumb.webp" },
    gallery_image_uploads: [
      { title: "Deck", img_upload: { url: "https://gplwebsitecdnblob.blob.core.windows.net/godrej-cdn/Images/deck.webp" } },
      { title: "Library", img_upload: { url: "https://gplwebsitecdnblob.blob.core.windows.net/godrej-cdn/Images/library.webp" } },
    ],
    gallery_video_uploads: [
      { title: "Concept AV", video_upload: "https://www.youtube.com/watch?v=X_PXTMFTVZM" },
      { title: "Location AV", video_upload: "https://youtu.be/CDIkPdV6s7Q" },
    ],
    brochure: { url: "https://gplwebsitecdnblob.blob.core.windows.net/godrej-cdn/Files/godrej-sky-shore-opp-doc.pdf" },
    compliance: [{ title: "Six Monthly Godrej Skyshore June 2026" }],
    rera_details: "The Letter of Intent (LOI) dated 30th March 2022 bearing number KW /PVT/0167 10615/LOI",
    ...overrides.item,
  };

  const ldJson =
    overrides.includeOrgLdJson === false
      ? ""
      : `<script id="organization-schema" type="application/ld+json" data-next-head="">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          legalName: "Godrej Properties Limited",
        })}</script>`;

  return `<!DOCTYPE html><html><head>
    <title data-next-head="">Godrej Skyshore Versova Mumbai | 4 bed regal residences starting at ₹11.89 Cr+</title>
    <meta name="description" content="Discover Godrej Skyshore in Versova, Andheri West, Mumbai. Explore 4 bed regal residences starting at ₹11.89 Cr+ with premium amenities.">
    ${ldJson}
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { item } } })}</script>
  </head><body></body></html>`;
}

describe("extractGodrejSkyShoreFacts (Phase 30 — real maximum-extraction contract)", () => {
  it("1. extracts the real project name from __NEXT_DATA__ item.name", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.name).toEqual({ value: "Godrej Skyshore", confidence: "High", note: "Embedded page data (__NEXT_DATA__), item.name." });
  });

  it("2. extracts the real developer legal name from JSON-LD Organization.legalName", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.developerGroup?.value).toBe("Godrej Properties Limited");
    expect(facts.developerGroup?.confidence).toBe("High");
  });

  it("3. extracts the real structured starting price from item.starting_prices (min across configs)", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.priceMin?.value).toBe("₹8.40 Cr");
    expect(facts.priceMin?.confidence).toBe("High");
  });

  it("4. extracts real possession month/year from item.possessionDate (ISO)", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.possessionMonth).toEqual({ value: "February", confidence: "High" });
    expect(facts.possessionYear).toEqual({ value: "2030", confidence: "High" });
  });

  it("5. extracts item.location into BOTH locality and microMarket, each independently classifiable", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.locality?.value).toBe("Versova, Andheri (W)");
    expect(facts.microMarket?.value).toBe("Versova, Andheri (W)");
  });

  it("6. extracts the real (Sales-Lounge-labeled) address as ambiguous/Medium confidence", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.address?.value).toContain("Sales Lounge");
    expect(facts.address?.ambiguous).toBe(true);
    expect(facts.address?.confidence).toBe("Medium");
  });

  it("7. extracts real named amenities as a count + full names in the note, still ambiguous per prior review determination", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.amenities?.value).toBe("3 selected");
    expect(facts.amenities?.note).toContain("Squash Court");
    expect(facts.amenities?.ambiguous).toBe(true);
  });

  it("8. extracts real named distance highlights + project-highlights prose, ambiguous", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.highlights?.value).toContain("International Airport - 18 mins*");
    expect(facts.highlights?.value).toContain("Shaping this space with intention.");
    expect(facts.highlights?.ambiguous).toBe(true);
  });

  it("9. never extracts a description fact -- deliberately left to human editorial judgment (Phase 28's documented exception, unchanged)", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.description).toBeUndefined();
  });

  it("10. does not fabricate FAQs -- genuinely absent from this page's real data, no faqs key produced", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.faqs).toBeUndefined();
  });

  it("11. does not fabricate land area from marketing prose -- no landAreaAcres key produced", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.landAreaAcres).toBeUndefined();
  });

  it("12. does not fabricate total units -- genuinely absent, no totalUnits key produced", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.totalUnits).toBeUndefined();
  });

  it("13. does not fabricate total towers -- genuinely absent, no totalTowers key produced", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.totalTowers).toBeUndefined();
  });

  it("14. extracts real media: cover image, gallery image count, primary video URL, brochure URL, compliance documents", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toBe("https://gplwebsitecdnblob.blob.core.windows.net/godrej-cdn/Images/thumb.webp");
    expect(facts.images?.value).toBe("2 image(s)");
    expect(facts.videoUrl?.value).toBe("https://www.youtube.com/watch?v=X_PXTMFTVZM");
    expect(facts.videoUrl?.note).toContain("2 videos found");
    expect(facts.brochure?.value).toContain("godrej-sky-shore-opp-doc.pdf");
    expect(facts.documents?.value).toBe("1 document(s)");
    expect(facts.tour360Url).toBeUndefined();
  });

  it("15. extracts real SEO meta title/description (Phase 29 regex, unchanged)", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(facts.metaTitle?.value).toContain("Godrej Skyshore Versova Mumbai");
    expect(facts.metaDescription?.value).toContain("Discover Godrej Skyshore in Versova");
    expect(facts.ogImageUrl).toBeUndefined();
  });

  it("16. missing optional sections -> those fields simply absent (MISSING via the classifier), not fabricated", () => {
    const facts = extractGodrejSkyShoreFacts(
      buildRealShapedHtml({ item: { neighbourhood: undefined, amenities: undefined, compliance: undefined, brochure: undefined } })
    );
    expect(facts.address).toBeUndefined();
    expect(facts.googleMapsUrl).toBeUndefined();
    expect(facts.amenities).toBeUndefined();
    expect(facts.documents).toBeUndefined();
    expect(facts.brochure).toBeUndefined();
    // Fields from unrelated, still-present sections keep working.
    expect(facts.name?.value).toBe("Godrej Skyshore");
  });

  it("17. malformed __NEXT_DATA__ JSON doesn't throw -- falls back to whatever title/meta/JSON-LD facts were found", () => {
    const html = buildRealShapedHtml().replace(
      /<script id="__NEXT_DATA__"[^>]*>[\s\S]*?<\/script>/,
      '<script id="__NEXT_DATA__" type="application/json">{ not valid json </script>'
    );
    const facts = extractGodrejSkyShoreFacts(html);
    expect(facts.metaTitle?.value).toContain("Godrej Skyshore");
    expect(facts.developerGroup?.value).toBe("Godrej Properties Limited");
    expect(facts.name).toBeUndefined();
  });

  it("17b. malformed JSON-LD block doesn't throw -- next-data facts still extracted", () => {
    const html = buildRealShapedHtml({ includeOrgLdJson: false }).replace(
      "<head>",
      '<head><script id="broken-schema" type="application/ld+json">{ this is not json </script>'
    );
    const facts = extractGodrejSkyShoreFacts(html);
    expect(facts.developerGroup).toBeUndefined();
    expect(facts.name?.value).toBe("Godrej Skyshore");
  });

  it("18. one missing/malformed section never fails the rest of the extraction (partial page failure tolerance)", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml({ item: { possessionDate: "not-a-real-date", starting_prices: "not-an-array" } }));
    expect(facts.possessionMonth).toBeUndefined();
    expect(facts.priceMin).toBeUndefined();
    // Unrelated fields still extracted correctly.
    expect(facts.name?.value).toBe("Godrej Skyshore");
    expect(facts.coverImage).toBeDefined();
  });

  it("19. feeding real extracted facts through the EXISTING classifier reproduces the known CONFLICT/GREEN_NEW/CONFIRMED cases", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    const GODREJ_PAYLOAD = {
      name: "Godrej Sky Shore",
      status: "UNDER_CONSTRUCTION" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "PM1180002500076",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri",
      reraNumber: "PM1180002500076",
      description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 8.4 Crore(s)",
      developerGroup: "Godrej Properties Ltd.",
      priceMinRupees: 84000000,
      possessionDateIso: "2031-12-01T00:00:00.000Z",
    };
    const result = classifyProjectEnrichment(GODREJ_PAYLOAD, { localityName: "Andheri West" }, facts, {
      url: GODREJ_SKY_SHORE_PROJECT_URL,
      tier: "OFFICIAL_DEVELOPER",
    });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("name").classification).toBe("CONFLICT"); // staged "Godrej Sky Shore" vs real "Godrej Skyshore"
    expect(byKey("developerGroup").classification).toBe("CONFLICT"); // "Godrej Properties Ltd." vs real "Godrej Properties Limited"
    expect(byKey("locality").classification).toBe("CONFLICT"); // "Andheri West" vs real "Versova, Andheri (W)"
    expect(byKey("possessionMonth").classification).toBe("CONFLICT");
    expect(byKey("possessionYear").classification).toBe("CONFLICT");
  });

  it("20. never leaks fixture-only content into a real extraction run -- fixture-exclusive fields (landAreaAcres, faqs) are absent even though the fixture module exists in this codebase", () => {
    const facts = extractGodrejSkyShoreFacts(buildRealShapedHtml());
    expect(GODREJ_SKY_SHORE_SOURCE_FACTS.landAreaAcres).toBeDefined(); // the fixture DOES have this -- proving it's genuinely a different source
    expect(facts.landAreaAcres).toBeUndefined(); // but real extraction correctly does not
    expect(GODREJ_SKY_SHORE_SOURCE_FACTS.faqs).toBeDefined();
    expect(facts.faqs).toBeUndefined();
  });
});

describe("godrejPropertiesAdapter (Phase 29/30 — real live adapter)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(godrejPropertiesAdapter.resolveDomain("Godrej Properties Ltd.")).toBe("https://www.godrejproperties.com");
    expect(godrejPropertiesAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("21. fetchProjectFacts performs a real fetch and returns the source URL's facts (source URL itself is attached by the caller, not the adapter)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);

    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);
    expect(facts.name?.value).toBe("Godrej Skyshore");
    expect(fetchMock).toHaveBeenCalledWith(
      GODREJ_SKY_SHORE_PROJECT_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("throws when the page fetch returns a non-OK status, so the caller can report 'source temporarily unavailable' distinctly from 'found nothing'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL)).rejects.toThrow();
  });

  it("22. throws when the fetch itself rejects (network failure) -- never silently returns empty facts for a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL)).rejects.toThrow("network down");
  });

  it("gracefully returns only regex-derived facts if the whole markup shape changes unexpectedly, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html><body>no head tags here</body></html>" }));
    const facts = await godrejPropertiesAdapter.fetchProjectFacts(GODREJ_SKY_SHORE_PROJECT_URL);
    expect(facts.metaTitle).toBeUndefined();
    expect(facts.name).toBeUndefined();
    expect(Object.keys(facts)).toHaveLength(0);
  });
});
