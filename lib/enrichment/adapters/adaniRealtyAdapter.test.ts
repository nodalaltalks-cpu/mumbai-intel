import { afterEach, describe, expect, it, vi } from "vitest";
import { adaniRealtyAdapter, extractAdaniLinkbayFacts, ADANI_LINKBAY_RESIDENCES_PROJECT_URL } from "./adaniRealtyAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of adanirealty.com's actual
 * linkbay-residences markup, captured live during Phase 31: entity-escaped
 * JSON-LD (`&quot;` for `"` -- a real quirk this page has that Godrej's
 * didn't), and a Sitecore JSS `__NEXT_DATA__` payload with the real
 * component/field names this project's page actually returned
 * (ProjectName.fields.location, PropertyBasicInfo.fields.status/projectArea/
 * possession/brochure, ProjectHighlights.fields.projectHighlights.
 * galleryIconsData/reraData, PropertyHighligtsInfo.fields[].type,
 * PropertyAmenitesInfo.fields.projectAmeneties.data, Faq.fields.faqData.faqs,
 * seoData.fields.ogImage, GalleryHighlights, GalleryModalData). No selector
 * here was invented -- every key name matches what Phase 31 actually found.
 */
function buildRealShapedHtml(overrides: { data?: Record<string, unknown>; includeOrgLdJson?: boolean } = {}): string {
  const data = {
    // Real shape (verified live): the title/location sit one level deeper,
    // under fields.projectName, not directly under fields.
    ProjectName: { fields: { projectName: { title: "Linkbay Residences", location: "off, Fun Republic, New Link road, Andheri west" } } },
    breadCrumbList: { fields: [{ label: "Home" }, { label: "Residential Projects" }, { label: "Linkbay Residences" }] },
    PropertyBasicInfo: {
      fields: {
        status: "Under Construction",
        projectArea: "2.5 Acres | 1.01 Hectares",
        // Real CMS bug: this field holds marketing prose, not a date.
        possession: "Linkbay Residences by Adani Realty offers 2, 3 & 4 BHK apartments in Andheri West, Mumbai.",
        // Real CMS bug: this field holds an address string, not a URL.
        brochure: "Linkbay Residences, off, Fun Republic, New Link road, Andheri west",
        propertyImage: "https://www.adanirealty.com/-/media/project/realty/logo/linkbay-residences.ashx",
      },
    },
    ConfigurationData: {
      fields: { configurationData: { city: "Delhi", items: [{ title: "Clubs in Ahemdabad", keys: [{ keyword: "The Belvedere Golf & Country Club" }] }] } },
    },
    ProjectHighlights: {
      fields: {
        projectHighlights: {
          galleryIconsData: [
            { label: "Configuration", type: "2, 3 & 4 BHK Luxury Apartments" },
            { label: "Under Construction", type: "Possession: 31/10/2028" },
            { label: "Project Area", type: "2.5 Acres | 1.01 Hectares" },
          ],
          reraData: [
            {
              reraNumber: "P51800047539",
              reraWebsiteLink: "https://maharera.mahaonline.gov.in/",
              reraModal: [{ downloadLink: "https://www.adanirealty.com/-/media/project/realty/residential/mumbai/linkbay-residences/rera/linkbay-residences-rera.ashx" }],
            },
          ],
        },
      },
    },
    PropertyHighligtsInfo: { fields: [{ type: "Low Rise Development (Stilt + 4 Floors)" }, { type: "Central Green" }, { type: "Belvedere Club" }] },
    PropertyAbout: {
      fields: {
        description:
          "<p><strong>Sky Lounge</strong></p><p>A perfect evening spot.</p><p><strong>Terrace Garden</strong></p><p>Open-sky greenery.</p>",
      },
    },
    PropertyAmenitesInfo: {
      fields: { projectAmeneties: { data: [{ caption: "Badminton Court" }, { caption: "Kids Play Area" }, { caption: "Swimming Pool" }] } },
    },
    Faq: {
      fields: {
        faqData: {
          faqs: [
            { title: "Where is Linkbay Residences by Adani Realty located?", body: "New Link Road, Andheri West." },
            { title: "What is the size of the property?", body: "2.5 acres." },
          ],
        },
      },
    },
    seoData: { fields: { ogImage: "https://www.adanirealty.com/-/media/project/realty/project-image/property-images_webp/thumbnail.ashx" } },
    GalleryHighlights: {
      fields: {
        galleryHighlights: [
          { type: "propertyLogo", src: "https://www.adanirealty.com/-/media/.../outdoor/evening-view.ashx" },
          // Real quirk: this entry is typed "tour360" but its src is a static image, not an interactive tour.
          { type: "tour360", src: "https://www.adanirealty.com/-/media/.../outdoor/view-01.ashx" },
        ],
      },
    },
    GalleryModalData: {
      fields: {
        galleryModalData: {
          videoCarouselData: {
            modalSlidesData: {
              gallerydata: [{ id: 0, videomp4: "https://www.adanirealty.com/-/media/.../video/adani-linkbay-reduced.ashx" }],
            },
          },
        },
      },
    },
    ...overrides.data,
  };

  const ldJson =
    overrides.includeOrgLdJson === false
      ? ""
      : `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org/",
          "@type": "Organization",
          name: "Adani Realty",
        })
          .replace(/"/g, "&quot;")}</script>`;

  return `<!DOCTYPE html><html><head>
    <title>Adani Linkbay Residences Mumbai: Price &amp; Plans</title>
    <meta name="description" content="Linkbay Residences by Adani Realty offers 2, 3 &amp; 4 BHK luxury apartments in Andheri West, Mumbai.">
    ${ldJson}
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data } } })}</script>
  </head><body></body></html>`;
}

describe("extractAdaniLinkbayFacts (Phase 31 — second-developer generalization)", () => {
  it("1. extracts the real project name from the Sitecore JSS ProjectName component", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.name?.value).toBe("Linkbay Residences");
  });

  it("2. extracts the real developer name from entity-escaped JSON-LD Organization.name", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.developerGroup?.value).toBe("Adani Realty");
  });

  it("3. extracts address from ProjectName.location; never fabricates a locality from prose", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.address?.value).toBe("off, Fun Republic, New Link road, Andheri west");
    expect(facts.locality).toBeUndefined(); // no discrete structured locality field exists on this page
    expect(facts.microMarket).toBeUndefined();
  });

  it("4. does NOT fabricate priceMin -- this page states prices are available on request, no structured price exists", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.priceMin).toBeUndefined();
  });

  it("5. extracts real possession month/year from the DD/MM/YYYY gallery-icon string, not from the mismapped 'possession' field", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.possessionMonth).toEqual({ value: "October", confidence: "High" });
    expect(facts.possessionYear).toEqual({ value: "2028", confidence: "High" });
  });

  it("6. extracts the real RERA number and certificate URL", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.reraNumber?.value).toBe("P51800047539");
    expect(facts.reraCertificateUrl?.value).toContain("linkbay-residences-rera.ashx");
  });

  it("7. never extracts a description fact -- same documented exception as Godrej, unchanged", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.description).toBeUndefined();
  });

  it("8. extracts real named amenities as a count + names in the note", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.amenities?.value).toBe("3 selected");
    expect(facts.amenities?.note).toContain("Badminton Court");
  });

  it("9. extracts real media: cover image, gallery image count, and the real MP4 video URL -- but NOT a fake 360 tour", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toContain("linkbay-residences.ashx");
    expect(facts.images?.value).toBe("2 image(s)");
    expect(facts.videoUrl?.value).toContain("adani-linkbay-reduced.ashx");
    expect(facts.tour360Url).toBeUndefined(); // the "tour360"-typed entry is just a static image, not a real tour
    expect(facts.brochure).toBeUndefined(); // the real 'brochure' field holds an address string, not a URL
  });

  it("10. extracts real SEO: meta title/description (regex, HTML entities decoded) and ogImageUrl (a field Godrej's page never had)", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    // The real page's raw <title> is "...Price &amp; Plans" -- must read as "&", not the raw entity.
    expect(facts.metaTitle?.value).toBe("Adani Linkbay Residences Mumbai: Price & Plans");
    expect(facts.metaTitle?.value).not.toContain("&amp;");
    expect(facts.metaDescription?.value).toContain("Linkbay Residences by Adani Realty");
    expect(facts.ogImageUrl?.value).toContain("thumbnail.ashx");
  });

  it("11. missing optional components -> those fields simply absent, not fabricated", () => {
    const facts = extractAdaniLinkbayFacts(
      buildRealShapedHtml({ data: { PropertyAmenitesInfo: undefined, Faq: undefined, GalleryModalData: undefined } })
    );
    expect(facts.amenities).toBeUndefined();
    expect(facts.faqs).toBeUndefined();
    expect(facts.videoUrl).toBeUndefined();
    expect(facts.name?.value).toBe("Linkbay Residences"); // unrelated fields still extracted
  });

  it("12. malformed/undecodable JSON-LD doesn't throw -- falls back to whatever next-data facts were found", () => {
    const html = buildRealShapedHtml({ includeOrgLdJson: false }).replace(
      "<head>",
      '<head><script type="application/ld+json">not valid &quot;json at all</script>'
    );
    const facts = extractAdaniLinkbayFacts(html);
    expect(facts.developerGroup).toBeUndefined();
    expect(facts.name?.value).toBe("Linkbay Residences");
  });

  it("13. one missing/malformed section never fails the rest of the extraction (partial page failure tolerance)", () => {
    const facts = extractAdaniLinkbayFacts(
      buildRealShapedHtml({ data: { ProjectHighlights: { fields: { projectHighlights: { galleryIconsData: "not-an-array", reraData: null } } } } })
    );
    expect(facts.possessionMonth).toBeUndefined();
    expect(facts.reraNumber).toBeUndefined();
    expect(facts.name?.value).toBe("Linkbay Residences"); // unrelated fields still extracted correctly
    expect(facts.coverImage).toBeDefined();
  });

  it("13b. never reads the unrelated ConfigurationData placeholder block (real leftover CMS demo content, not project data)", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    const allValues = JSON.stringify(facts);
    expect(allValues).not.toContain("Belvedere Golf");
    expect(allValues).not.toContain("Ahemdabad");
  });

  it("14. source URL is attached by the caller (classifyProjectEnrichment), not the adapter -- verified via the classification integration test below", () => {
    expect(ADANI_LINKBAY_RESIDENCES_PROJECT_URL).toBe("https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences");
  });

  it("15. feeding real extracted facts through the EXISTING classifier reproduces a realistic CONFIRMED/CONFLICT/GREEN_NEW/MISSING mix", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    // The real staged record for this project (Phase 31 DB inspection).
    const ADANI_PAYLOAD = {
      name: "Adani Linkbay Residences",
      status: "UNDER_CONSTRUCTION" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "P51800047539",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri-west",
      reraNumber: "P51800047539",
      description: "3 BHK, Multistorey Apartment is available for Sale in Andheri West, Mumbai for 6.9 Crore(s)",
      developerGroup: "Adani Realty & RC Group",
      priceMinRupees: 44608000,
      possessionDateIso: "2028-10-01T00:00:00.000Z",
    };
    const result = classifyProjectEnrichment(ADANI_PAYLOAD, { localityName: "Andheri West" }, facts, {
      url: ADANI_LINKBAY_RESIDENCES_PROJECT_URL,
      tier: "OFFICIAL_DEVELOPER",
    });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("reraNumber").classification).toBe("CONFIRMED"); // MagicBricks already had the correct real RERA number
    expect(byKey("possessionMonth").classification).toBe("CONFIRMED");
    expect(byKey("possessionYear").classification).toBe("CONFIRMED");
    expect(byKey("name").classification).toBe("CONFLICT"); // staged "Adani Linkbay Residences" vs real "Linkbay Residences"
    expect(byKey("developerGroup").classification).toBe("CONFLICT"); // "& RC Group" JV suffix vs real "Adani Realty" alone
    expect(byKey("address").classification).toBe("GREEN_NEW"); // was blank, real value found
    expect(byKey("reraCertificateUrl").classification).toBe("GREEN_NEW");
    expect(result).toHaveLength(38);
  });

  it("16. never leaks Godrej fixture content into an Adani extraction run", () => {
    const facts = extractAdaniLinkbayFacts(buildRealShapedHtml());
    expect(facts.tagline).toBeUndefined(); // Godrej's fixture has a tagline; Adani's real page has no equivalent field
    expect(facts.name?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.name?.value);
  });
});

describe("adaniRealtyAdapter (Phase 31 — real live adapter, second developer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(adaniRealtyAdapter.resolveDomain("Adani Realty & RC Group")).toBe("https://www.adanirealty.com");
    expect(adaniRealtyAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("performs a real fetch and returns extracted facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);
    const facts = await adaniRealtyAdapter.fetchProjectFacts(ADANI_LINKBAY_RESIDENCES_PROJECT_URL);
    expect(facts.name?.value).toBe("Linkbay Residences");
    expect(fetchMock).toHaveBeenCalledWith(
      ADANI_LINKBAY_RESIDENCES_PROJECT_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("17. throws when the page fetch returns a non-OK status ('adapter failure' / 'unavailable source')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(adaniRealtyAdapter.fetchProjectFacts(ADANI_LINKBAY_RESIDENCES_PROJECT_URL)).rejects.toThrow();
  });

  it("18. throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(adaniRealtyAdapter.fetchProjectFacts(ADANI_LINKBAY_RESIDENCES_PROJECT_URL)).rejects.toThrow("network down");
  });

  it("19. gracefully returns no facts if the whole markup shape changes unexpectedly, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html><body>nothing here</body></html>" }));
    const facts = await adaniRealtyAdapter.fetchProjectFacts(ADANI_LINKBAY_RESIDENCES_PROJECT_URL);
    expect(Object.keys(facts)).toHaveLength(0);
  });
});
