import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPurvaEstrellaFacts, puravankaraAdapter, PURVA_ESTRELLA_PROJECT_URL } from "./puravankaraAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of puravankara.com's actual
 * purva-estrella markup, captured live during Phase 42: no Organization
 * JSON-LD on this project page, and a Strapi-backed `__NEXT_DATA__` payload
 * at `props.pageProps.singleproject[0].attributes` (an array-wrapped single
 * object -- a real shape quirk distinct from Gurukrupa Realcon's own
 * Strapi site, which puts the object directly at `projectDetail.attributes`
 * with no array wrapper). Real field names Phase 42 actually found:
 * projectTitle, Price ("3.52 Cr+"), Address ("Lokhandwala, Andheri (W)"),
 * About.Description (rich-text HTML with a real leftover `&amp;`),
 * ProjectHighlights (a discrete `item` array PLUS a `<p>`-per-bullet prose
 * block using a literal "- " prefix and a stray U+2060 WORD JOINER
 * character), Amenities.amenities.data (27 named entries),
 * project_statuses.data[0].attributes.projectStatus ("Newly Launched"), and
 * Banner[0].Desktopbanner (single-media shape).
 */
function buildRealShapedHtml(overrides: { attrs?: Record<string, unknown> } = {}): string {
  const attrs = {
    projectTitle: "Purva Estrella",
    projectUrl: "purva-estrella",
    Price: "3.52 Cr+",
    Address: "Lokhandwala, Andheri (W)",
    Apartments: "2,3 & 4 BHK",
    About: {
      SectionTitle: "Purva Estrella",
      Description: "<p>Purva Estrella is a thoughtfully planned gated development where every element is placed with intent.</p>",
      Brochure: { data: null },
    },
    ProjectHighlights: {
      item: [
        { id: 213, Title: " 2,3 & 4 BHK", text: "Apartments" },
        { id: 215, Title: "6", text: "Towers" },
      ],
      Description:
        "<p>From open spaces to curated amenities, every element is designed to support a calmer, more considered way of living.</p><p>- A Gated Community</p><p>- ⁠Biophilic Arrival Experience</p><p>- ⁠~45,000 Sq. Ft. of Green Spaces</p>",
    },
    Amenities: {
      sectionTitle: "Project Amenities",
      amenities: {
        data: [
          { id: 171, attributes: { Title: "Luxurious drop off Experience" } },
          { id: 172, attributes: { Title: "Double-Height Air Conditioned Entrance Lobby" } },
          { id: 173, attributes: { Title: "MUGA Court" } },
        ],
      },
    },
    project_statuses: { data: [{ id: 1, attributes: { projectStatus: "Newly Launched" } }] },
    Banner: [
      {
        id: 66,
        BannerTitle: "Purva Estrella",
        Desktopbanner: { data: { id: 7583, attributes: { url: "/uploads/estrella_banner.jpeg" } } },
      },
    ],
    Location: null,
    locationAdvantage: [],
    Gallery: null,
    Faqs: null,
    floorPlanPdf: { data: null },
    constructionupdates: { video: [] },
    ...overrides.attrs,
  };

  return `<!DOCTYPE html><html><head>
    <title>2,3 &amp; 4 BHK Apartments in Lokhandwala, Andheri | Purva Estrella</title>
    <meta name="description" content="Discover Purva Estrella in Mumbai by Puravankara. Explore premium apartments with modern amenities.">
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { singleproject: [{ id: 58, attributes: attrs }] } } })}</script>
  </head><body></body></html>`;
}

describe("extractPurvaEstrellaFacts (Phase 42 — fifth developer, first selected straight from Phase 41's bulk discovery batch)", () => {
  it("1. extracts the real project name from the Strapi projectTitle field (array-wrapped singleproject shape)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.name?.value).toBe("Purva Estrella");
  });

  it("2. extracts real meta title/description (HTML entities decoded)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.metaTitle?.value).toContain("2,3 & 4 BHK Apartments");
    expect(facts.metaTitle?.value).not.toContain("&amp;");
  });

  it("3. never extracts developerGroup -- this project page has no Organization JSON-LD (it lives on the site's homepage, a different page)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.developerGroup).toBeUndefined();
  });

  it("4. extracts category as Residential from the page's own title/meta text", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.category?.value).toBe("Residential");
  });

  it("5. maps 'Newly Launched' to Pre-Launch at Medium confidence (a phrasing variant, not a literal match)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.status?.value).toBe("Pre-Launch");
    expect(facts.status?.confidence).toBe("Medium");
  });

  it("6. extracts locality/microMarket from the labeled Address field", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.locality?.value).toBe("Lokhandwala, Andheri (W)");
    expect(facts.microMarket?.value).toBe("Lokhandwala, Andheri (W)");
  });

  it("7. extracts priceMin ONLY from a 'starting from' figure -- never fabricates priceMax", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.priceMin?.value).toBe("₹3.52 Cr");
    expect(facts.priceMax).toBeUndefined();
  });

  it("8. extracts totalTowers from the structured ProjectHighlights.item array", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.totalTowers?.value).toBe("6");
  });

  it("9. splits the '<p>'-per-bullet highlights prose correctly, stripping the leading '- ' and stray WORD JOINER character, and never includes the intro sentence as a bullet", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.highlights?.items).toEqual(["A Gated Community", "Biophilic Arrival Experience", "~45,000 Sq. Ft. of Green Spaces"]);
    expect(facts.highlights?.items).not.toContain(expect.stringContaining("From open spaces"));
  });

  it("10. extracts real named amenities from the structured Amenities section", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.amenities?.items).toEqual(["Luxurious drop off Experience", "Double-Height Air Conditioned Entrance Lobby", "MUGA Court"]);
  });

  it("11. extracts the real cover image from the single-object Banner[0].Desktopbanner shape", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toBe("https://www.puravankara.com/uploads/estrella_banner.jpeg");
  });

  it("12. never fabricates a RERA number -- this page publishes none (confirmed absent, not a parsing failure)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.reraNumber).toBeUndefined();
    expect(facts.reraStatus).toBeUndefined();
  });

  it("13. never fabricates fields genuinely absent from this page (coordinates/gallery/brochure/faqs/video)", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.latitude).toBeUndefined();
    expect(facts.longitude).toBeUndefined();
    expect(facts.googleMapsUrl).toBeUndefined();
    expect(facts.images).toBeUndefined();
    expect(facts.brochure).toBeUndefined();
    expect(facts.faqs).toBeUndefined();
    expect(facts.videoUrl).toBeUndefined();
  });

  it("14. missing optional sections -> those fields simply absent, not fabricated (partial page failure tolerance)", () => {
    const facts = extractPurvaEstrellaFacts(
      buildRealShapedHtml({ attrs: { Amenities: null, ProjectHighlights: null, Banner: null, project_statuses: { data: [] } } })
    );
    expect(facts.amenities).toBeUndefined();
    expect(facts.highlights).toBeUndefined();
    expect(facts.totalTowers).toBeUndefined();
    expect(facts.coverImage).toBeUndefined();
    expect(facts.status).toBeUndefined();
    expect(facts.name?.value).toBe("Purva Estrella"); // unrelated fields still extracted
  });

  it("15. malformed __NEXT_DATA__ doesn't throw -- falls back to regex-based facts only", () => {
    const html = buildRealShapedHtml().replace(
      /<script id="__NEXT_DATA__"[\s\S]*?<\/script>/,
      '<script id="__NEXT_DATA__" type="application/json">not valid json</script>'
    );
    const facts = extractPurvaEstrellaFacts(html);
    expect(facts.name).toBeUndefined();
    expect(facts.metaTitle?.value).toContain("Purva Estrella");
  });

  it("16. gracefully returns no facts if the whole markup shape changes unexpectedly, without throwing", () => {
    const facts = extractPurvaEstrellaFacts("<html><body>nothing here</body></html>");
    expect(Object.keys(facts)).toHaveLength(0);
  });

  it("17. feeding real extracted facts through the EXISTING classifier reproduces a realistic GREEN_NEW/YELLOW/MISSING mix", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    const BLANK_PAYLOAD = {
      name: "",
      status: "ANNOUNCED" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "purva-estrella",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri-west",
    };
    const result = classifyProjectEnrichment(BLANK_PAYLOAD, {}, facts, { url: PURVA_ESTRELLA_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("name").classification).toBe("GREEN_NEW");
    expect(byKey("priceMin").classification).toBe("GREEN_NEW");
    expect(byKey("priceMax").classification).toBe("MISSING");
    expect(byKey("reraNumber").classification).toBe("MISSING");
    expect(result).toHaveLength(44);
  });

  it("18. never leaks Godrej fixture content into a Puravankara extraction run", () => {
    const facts = extractPurvaEstrellaFacts(buildRealShapedHtml());
    expect(facts.name?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.name?.value);
  });
});

describe("puravankaraAdapter (Phase 42 — real live adapter, fifth developer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(puravankaraAdapter.resolveDomain("Puravankara Limited")).toBe("https://www.puravankara.com");
    expect(puravankaraAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("performs a real fetch and returns extracted facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);
    const facts = await puravankaraAdapter.fetchProjectFacts(PURVA_ESTRELLA_PROJECT_URL);
    expect(facts.name?.value).toBe("Purva Estrella");
  });

  it("19. throws when the page fetch returns a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(puravankaraAdapter.fetchProjectFacts(PURVA_ESTRELLA_PROJECT_URL)).rejects.toThrow();
  });

  it("20. throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(puravankaraAdapter.fetchProjectFacts(PURVA_ESTRELLA_PROJECT_URL)).rejects.toThrow("network down");
  });
});
