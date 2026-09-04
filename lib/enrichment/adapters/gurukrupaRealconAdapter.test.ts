import { afterEach, describe, expect, it, vi } from "vitest";
import { extractGurukrupaEkamFacts, gurukrupaRealconAdapter, GURUKRUPA_EKAM_PROJECT_URL } from "./gurukrupaRealconAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of gurukruparealcon.com's actual
 * gurukrupa-ekam markup, captured live during Phase 40: a single
 * BreadcrumbList JSON-LD (no Organization/Product block on this page -- see
 * the adapter's own doc comment for why developerGroup is deliberately never
 * extracted here), and a Strapi-backed `__NEXT_DATA__` payload
 * (`projectDetail.attributes`) with the real field names Phase 40 actually
 * found: projectTitle, projectType, status ("ongoing"), location ("Andheri"
 * -- no West/East), overview.description (HTML rich text with a real
 * leftover `&amp;` entity), banner.desktopBanner, rerasec.title (a
 * "Maha RERA No. : ..." string), locationAdvantage.map (a Google Maps embed
 * URL carrying real `!2d!3d` coordinates), advantageItems (a grouped
 * connectivity list), and projectGallery.galleryTab (named room photos, each
 * `images.data` an ARRAY -- a real shape quirk distinct from the single-media
 * `data` object shape `banner.desktopBanner` uses). This is a FOURTH
 * distinct page shape now proven (Next.js + Strapi), and the first developer
 * discovered via Phase 39's pipeline rather than hand-picked.
 */
function buildRealShapedHtml(overrides: { attrs?: Record<string, unknown>; includeBreadcrumbLdJson?: boolean } = {}): string {
  const attrs = {
    projectTitle: "Gurukrupa Ekam",
    slug: "gurukrupa-ekam",
    projectType: "residential",
    status: "ongoing",
    location: "Andheri",
    configuration: "2 & 3 BHK",
    overview: {
      title: "Welcome to Gurukrupa Ekam",
      description:
        "<p>Strategically located on New Link Road, Andheri West, Gurukrupa EKAM offers spacious 2 &amp; 3 BHK residences with exceptional connectivity.</p>",
      brochure: { data: null },
    },
    banner: {
      desktopBanner: { data: { id: 197, attributes: { url: "/uploads/large_banner_aaf995bdd3.png" } } },
    },
    rerasec: {
      title: "Maha RERA No. : PM1180002501525",
      reradisc: "Information on this website is for guidance only.",
    },
    locationAdvantage: {
      title: "Seamless Access to Every Essential",
      map: "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d7538.379!2d72.83165!3d19.143178!3m2!1i1024!2i768",
    },
    advantageItems: [
      {
        id: 18,
        name: "CONNECTIVITY",
        advantages: [
          { id: 79, name: "Infiniti Mall", distance: "1 min" },
          { id: 80, name: "Metro Station", distance: "2 mins" },
        ],
      },
    ],
    projectGallery: {
      sectioTitle: "Glimpse to Luxury",
      videotabcontent: [],
      galleryTab: [
        { id: 14, title: "Living Room", images: { data: [{ id: 538, attributes: { url: "/uploads/Livingroom_b183ef632e.png" } }] } },
        { id: 15, title: "Kitchen", images: { data: [{ id: 539, attributes: { url: "/uploads/Kitchen_c368d9206c.png" } }] } },
      ],
    },
    constructionupdate: null,
    amenities: null,
    ...overrides.attrs,
  };

  const breadcrumbLd =
    overrides.includeBreadcrumbLdJson === false
      ? ""
      : `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://gurukruparealcon.com/" },
            { "@type": "ListItem", position: 3, name: "Gurukrupa Ekam", item: "https://gurukruparealcon.com/projects/gurukrupa-ekam" },
          ],
        })}</script>`;

  return `<!DOCTYPE html><html><head>
    <title>Gurukrupa Ekam | 2 &amp; 3 BHK Flats in Gurukrupa Ekam</title>
    <meta name="description" content="Explore Gurukrupa Ekam, offering 2 &amp; 3 BHK flats with 70+ amenities on New Link Road.">
    ${breadcrumbLd}
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { projectDetail: { id: 25, attributes: attrs } } } })}</script>
  </head><body></body></html>`;
}

describe("extractGurukrupaEkamFacts (Phase 40 — fourth developer, first discovered via Phase 39)", () => {
  it("1. extracts the real project name from the Strapi projectTitle field", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.name?.value).toBe("Gurukrupa Ekam");
  });

  it("2. extracts real meta title/description (HTML entities decoded)", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.metaTitle?.value).toBe("Gurukrupa Ekam | 2 & 3 BHK Flats in Gurukrupa Ekam");
    expect(facts.metaTitle?.value).not.toContain("&amp;");
    expect(facts.metaDescription?.value).toContain("70+ amenities");
  });

  it("3. never extracts developerGroup -- this project page has no Organization JSON-LD (it lives on the site's homepage, a different page)", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.developerGroup).toBeUndefined();
  });

  it("4. maps the page's own 'ongoing' status to Under Construction, at Medium confidence (an industry convention, not a literal string match)", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.status?.value).toBe("Under Construction");
    expect(facts.status?.confidence).toBe("Medium");
  });

  it("5. extracts category as Residential from projectType", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.category?.value).toBe("Residential");
  });

  it("6. extracts locality as ambiguous — the page's own field never says West/East", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.locality?.value).toBe("Andheri");
    expect(facts.locality?.ambiguous).toBe(true);
  });

  it("7. never fabricates a price -- this page publishes none", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.priceMin).toBeUndefined();
  });

  it("8. extracts the real RERA number", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.reraNumber?.value).toBe("PM1180002501525");
  });

  it("9. extracts the embedded Google Maps URL", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.googleMapsUrl?.value).toContain("maps/embed");
  });

  it("10. extracts the connectivity/location-advantage list as ambiguous highlights", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.highlights?.items).toEqual(["Infiniti Mall (1 min)", "Metro Station (2 mins)"]);
    expect(facts.highlights?.ambiguous).toBe(true);
  });

  it("11. extracts real gallery images from the ARRAY-shaped images.data (distinct from the single-object banner shape)", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.images?.items).toEqual([
      "https://gurukruparealcon.com/uploads/Livingroom_b183ef632e.png",
      "https://gurukruparealcon.com/uploads/Kitchen_c368d9206c.png",
    ]);
  });

  it("12. extracts the real cover image from the single-object banner.desktopBanner shape", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toBe("https://gurukruparealcon.com/uploads/large_banner_aaf995bdd3.png");
  });

  it("13. never fabricates fields genuinely absent from this page (amenities is null in the CMS despite prose mentioning it; brochure/video/construction update are all null/empty)", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.amenities).toBeUndefined();
    expect(facts.brochure).toBeUndefined();
    expect(facts.videoUrl).toBeUndefined();
    expect(facts.constructionPercent).toBeUndefined();
    expect(facts.actualPossession).toBeUndefined();
    expect(facts.specifications).toBeUndefined();
    expect(facts.faqs).toBeUndefined();
    expect(facts.totalUnits).toBeUndefined();
    expect(facts.totalTowers).toBeUndefined();
    expect(facts.address).toBeUndefined();
  });

  it("14. missing optional sections -> those fields simply absent, not fabricated (partial page failure tolerance)", () => {
    const facts = extractGurukrupaEkamFacts(
      buildRealShapedHtml({ attrs: { rerasec: null, locationAdvantage: null, advantageItems: null, projectGallery: null, banner: null } })
    );
    expect(facts.reraNumber).toBeUndefined();
    expect(facts.googleMapsUrl).toBeUndefined();
    expect(facts.highlights).toBeUndefined();
    expect(facts.images).toBeUndefined();
    expect(facts.coverImage).toBeUndefined();
    expect(facts.name?.value).toBe("Gurukrupa Ekam"); // unrelated fields still extracted
  });

  it("15. malformed __NEXT_DATA__ doesn't throw -- falls back to regex-based facts only", () => {
    const html = buildRealShapedHtml().replace(
      /<script id="__NEXT_DATA__"[\s\S]*?<\/script>/,
      '<script id="__NEXT_DATA__" type="application/json">not valid json</script>'
    );
    const facts = extractGurukrupaEkamFacts(html);
    expect(facts.name).toBeUndefined();
    expect(facts.metaTitle?.value).toContain("Gurukrupa Ekam");
  });

  it("16. an unrecognized status value is left unmapped rather than guessed", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml({ attrs: { status: "featured" } }));
    expect(facts.status).toBeUndefined();
  });

  it("17. gracefully returns no facts if the whole markup shape changes unexpectedly, without throwing", () => {
    const facts = extractGurukrupaEkamFacts("<html><body>nothing here</body></html>");
    expect(Object.keys(facts)).toHaveLength(0);
  });

  it("18. feeding real extracted facts through the EXISTING classifier reproduces a realistic GREEN_NEW/YELLOW/MISSING mix", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    // The real staged record for this project (Phase 38/39 DB inspection).
    const GURUKRUPA_PAYLOAD = {
      name: "Gurukrupa Ekam",
      status: "UNDER_CONSTRUCTION" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "PM1180002501525",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri-west",
      reraNumber: "PM1180002501525",
      developerGroup: "Gurukrupa Realcon",
      priceMinRupees: 32600000,
      possessionDateIso: "2029-04-01T00:00:00.000Z",
    };
    const result = classifyProjectEnrichment(GURUKRUPA_PAYLOAD, { localityName: "Andheri West" }, facts, {
      url: GURUKRUPA_EKAM_PROJECT_URL,
      tier: "OFFICIAL_DEVELOPER",
    });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("reraNumber").classification).toBe("CONFIRMED"); // real RERA number matches exactly
    expect(byKey("status").classification).toBe("CONFIRMED"); // "Under Construction" matches the existing staged value
    expect(byKey("googleMapsUrl").classification).toBe("GREEN_NEW"); // was blank, real value found
    expect(byKey("locality").classification).toBe("CONFLICT"); // staged "Andheri West" vs the page's own plainer "Andheri" -- never silently overwritten
    expect(result).toHaveLength(40);
  });

  it("19. never leaks Godrej fixture content into a Gurukrupa extraction run", () => {
    const facts = extractGurukrupaEkamFacts(buildRealShapedHtml());
    expect(facts.name?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.name?.value);
  });
});

describe("gurukrupaRealconAdapter (Phase 40 — real live adapter, fourth developer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(gurukrupaRealconAdapter.resolveDomain("Gurukrupa Realcon")).toBe("https://gurukruparealcon.com");
    expect(gurukrupaRealconAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("performs a real fetch and returns extracted facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);
    const facts = await gurukrupaRealconAdapter.fetchProjectFacts(GURUKRUPA_EKAM_PROJECT_URL);
    expect(facts.name?.value).toBe("Gurukrupa Ekam");
    expect(fetchMock).toHaveBeenCalledWith(
      GURUKRUPA_EKAM_PROJECT_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("20. throws when the page fetch returns a non-OK status ('adapter failure' / 'unavailable source')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(gurukrupaRealconAdapter.fetchProjectFacts(GURUKRUPA_EKAM_PROJECT_URL)).rejects.toThrow();
  });

  it("21. throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(gurukrupaRealconAdapter.fetchProjectFacts(GURUKRUPA_EKAM_PROJECT_URL)).rejects.toThrow("network down");
  });
});
