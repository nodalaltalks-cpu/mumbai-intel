import { afterEach, describe, expect, it, vi } from "vitest";
import { extractKalpataruVianFacts, kalpataruAdapter, KALPATARU_VIAN_PROJECT_URL } from "./kalpataruAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of kalpataru.com's actual
 * kalpataru-vian markup, captured live during Phase 38: three
 * `application/ld+json` blocks (Organization, RealEstateAgent,
 * ItemList<VideoObject>), a labeled project-summary block
 * ("Status:"/"Location:"/"Price:"/"Possession:"/"Typology:"), an explicit
 * RERA disclaimer paragraph (registering the project under a DIFFERENT name,
 * "Kalpataru Hrushikesh", from its marketing name "Kalpataru Vian"), an
 * "Overview" paragraph with a real leftover HTML comment for an UNRELATED
 * project (Kalpataru Summit) sitting inside it, a "Key Benefits" bullet
 * slider, a categorized amenities accordion with one entire category
 * HTML-commented-out, and a labeled downloads list (Brochure, Opportunity
 * Docket). This is a THIRD, materially different page shape from both Godrej
 * (Next.js `__NEXT_DATA__`) and Adani (Sitecore JSS `__NEXT_DATA__`) -- this
 * page has no embedded JSON payload of any kind; every fact below comes from
 * plain, explicitly-labeled HTML. No selector here was invented -- every
 * string matches what Phase 38 actually found on the live page.
 */
function buildRealShapedHtml(overrides: { omit?: string[]; extraHead?: string } = {}): string {
  const omit = new Set(overrides.omit ?? []);

  const projectListLine = (label: string, value: string) =>
    omit.has(label)
      ? ""
      : `<div class="project-list d-flex"><div class="icon-img"><img src="x.png"></div> ${label}: ${value}</div>`;

  const orgLdJson = omit.has("org")
    ? ""
    : `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Kalpataru Limited",
      })}</script>`;

  const videoLdJson = omit.has("videos")
    ? ""
    : `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: [
          { "@type": "VideoObject", name: "Vian AI Revealer", contentUrl: "https://www.youtube.com/watch?v=nM0qo05eo2M" },
          { "@type": "VideoObject", name: "Vian Walkthrough", contentUrl: "https://www.youtube.com/watch?v=SolEUi0xYXg" },
        ],
      })}</script>`;

  const reraBlock = omit.has("rera")
    ? ""
    : `<div id="rera_details"><p><strong>Disclaimer</strong> - "The Project "Kalpataru Vian" is registered with MahaRERA as "Kalpataru Hrushikesh" under registration no. PR1180002600863.</p>
       <p>Details available at: http://maharera.mahaonline.gov.in.</p></div>`;

  const overviewBlock = omit.has("overview")
    ? ""
    : `<div id="overview"><h1 class="project-inner-header">KALPATARU VIAN</h1>
       <p class="project-inner-description">
         There are homes that offer luxury, and then there are those that offer serenity.<br><br>Welcome to Kalpataru Vian, where silence and opulence live as one.<!--  Introducing iconic Offices for iconic businesses, now built at an iconic landmark: Mulund. Kalpataru Summit is an accredited Grade A office space. -->
       </p></div>`;

  const keyBenefits = omit.has("keyBenefits")
    ? ""
    : `<div class="double-main-heading">02 KALPATARU VIAN KEY BENEFITS</div>
       <div class="overview-slider-text">Nestled on Lokhandwala's serene backroad, on a corner plot</div>
       <div class="overview-slider-text">Approx. 4 acres of meticulously planned private enclave</div>
       <div class="overview-slider-text">Curated 30+ lifestyle amenities crafted for sophisticated living</div>`;

  const amenitiesBlock = omit.has("amenities")
    ? ""
    : `<div id="amenities">
        <div class="col-sm-3"><div class="amenitiess-slider-text">Lifestyle &amp; Leisure</div>
          <ul><li>Swimming Pool</li><li>Outdoor Jacuzzi</li><li>Party Lawn</li></ul>
        </div>
        <!--<div class="col-sm-3"><div class="amenitiess-slider-text">Terrace Level Amenities</div>
          <ul><li>Wellness Deck</li><li>Creekside Lounge</li></ul>
        </div>-->
        <div class="col-sm-3"><div class="amenitiess-slider-text">Fitness & Wellness</div>
          <ul><li>Gym</li><li>Yoga & Pilates Studio</li></ul>
        </div>
       </div>
       <!--Mobile slider-->`;

  const downloads = omit.has("downloads")
    ? ""
    : `<div class="download-item"><div class="download-item-text">Brochure</div>
         <a class="icon-button" href="https://www.kalpataru.com/uploads/Kalpataru-Vian-Brochure.pdf">VIEW</a></div>
       <div class="download-item"><div class="download-item-text">Opportunity Docket</div>
         <a class="icon-button" href="https://d2j4tkbto6uvqv.cloudfront.net/kalpataru/1783089933.pdf">VIEW</a></div>`;

  return `<!DOCTYPE html><html><head>
    <title>Kalpataru Vian, Hrushikesh, Lokhandwala Andheri West | Luxury 3, 4 &amp; 4.5 Bed Residences by Kalpataru</title>
    <meta name="description" content="Kalpataru Vian is a luxury residential project in Hrushikesh, Lokhandwala, Andheri West, Mumbai.">
    <meta property="og:image" content="https://d2j4tkbto6uvqv.cloudfront.net/kalpataru/6a3d5deec35ec.jpg" />
    ${orgLdJson}
    ${videoLdJson}
    ${overrides.extraHead ?? ""}
    </head><body>
    <div class="p_title">${omit.has("name") ? "" : "Kalpataru Vian"}</div>
    ${projectListLine("Status", "New Launch")}
    ${projectListLine("Location", "Hrushikesh, Lokhandwala, Andheri (W)")}
    ${projectListLine("Price", "Starts from ₹ 5.61Cr+* onwards")}
    ${projectListLine("Possession", "June 2032")}
    ${projectListLine("Typology", "3, 4, 4.5 Residences")}
    ${
      omit.has("gtag")
        ? ""
        : `<script>gtag('event', 'x', { property_type: 'residential', project_name: 'Kalpataru Vian' });</script>`
    }
    ${overviewBlock}
    ${keyBenefits}
    ${amenitiesBlock}
    ${reraBlock}
    ${downloads}
  </body></html>`;
}

describe("extractKalpataruVianFacts (Phase 38 — third-developer generalization, a third distinct page shape)", () => {
  it("1. extracts the real project name from the page's own banner element", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.name?.value).toBe("Kalpataru Vian");
  });

  it("2. extracts real meta title/description (HTML entities decoded)", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.metaTitle?.value).toContain("Luxury 3, 4 & 4.5 Bed Residences");
    expect(facts.metaTitle?.value).not.toContain("&amp;");
    expect(facts.metaDescription?.value).toContain("Kalpataru Vian is a luxury residential project");
  });

  it("3. extracts the real developer name from JSON-LD Organization.name", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.developerGroup?.value).toBe("Kalpataru Limited");
  });

  it("4. maps the page's own 'New Launch' status label to Pre-Launch via this codebase's existing CONSTRUCTION_BADGE_LABEL mapping", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.status?.value).toBe("Pre-Launch");
  });

  it("5. extracts locality/microMarket from the labeled Location line", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.locality?.value).toBe("Hrushikesh, Lokhandwala, Andheri (W)");
    expect(facts.microMarket?.value).toBe("Hrushikesh, Lokhandwala, Andheri (W)");
  });

  it("6. extracts priceMin ONLY from a 'starting from' figure -- never fabricates priceMax", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.priceMin?.value).toBe("₹5.61 Cr");
    expect(facts.priceMax).toBeUndefined();
  });

  it("7. extracts real possession month/year from a plain-English 'Month Year' label", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.possessionMonth).toEqual({ value: "June", confidence: "High", note: expect.stringContaining("June 2032") });
    expect(facts.possessionYear).toEqual({ value: "2032", confidence: "High" });
  });

  it("8. extracts category as Residential from the page's own gtag tracking data", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.category?.value).toBe("Residential");
  });

  it("9. extracts the real RERA number and infers 'Registered' status from that structured evidence", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.reraNumber?.value).toBe("PR1180002600863");
    expect(facts.reraStatus?.value).toBe("Registered");
    expect(facts.reraCertificateUrl).toBeUndefined(); // no project-specific certificate link exists on this page
  });

  it("10. surfaces the real MahaRERA-registered-name discrepancy ('Kalpataru Hrushikesh' vs marketing name 'Kalpataru Vian') as an ambiguous tagline fact, not a silent rename", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.tagline?.value).toContain("Kalpataru Hrushikesh");
    expect(facts.tagline?.ambiguous).toBe(true);
    expect(facts.name?.value).toBe("Kalpataru Vian"); // name itself is never overwritten by the RERA-registered name
  });

  it("11. never leaks the unrelated commented-out Kalpataru Summit blurb into any extracted fact", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml({ omit: ["rera"] })); // force tagline to fall back to overview prose
    expect(facts.tagline?.value).not.toContain("Summit");
    expect(facts.tagline?.value).not.toContain("Mulund");
    expect(JSON.stringify(facts)).not.toContain("Summit");
  });

  it("12. extracts landAreaAcres as YELLOW/ambiguous -- the page's own figure is explicitly an approximation", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.landAreaAcres?.value).toBe("4 acres");
    expect(facts.landAreaAcres?.ambiguous).toBe(true);
    expect(facts.landAreaAcres?.confidence).toBe("Medium");
  });

  it("13. extracts real Key Benefits as highlights, with the real bullet text preserved", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.highlights?.items).toContain("Curated 30+ lifestyle amenities crafted for sophisticated living");
    expect(facts.highlights?.items?.length).toBe(3);
  });

  it("14. extracts real amenities, EXCLUDING the entire HTML-commented-out category", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.amenities?.items).toEqual(["Swimming Pool", "Outdoor Jacuzzi", "Party Lawn", "Gym", "Yoga & Pilates Studio"]);
    expect(facts.amenities?.items).not.toContain("Wellness Deck");
    expect(facts.amenities?.items).not.toContain("Creekside Lounge");
  });

  it("15. extracts real cover image (og:image) and video URL (JSON-LD ItemList), but never a fake 360 tour or a curated image gallery", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toContain("6a3d5deec35ec.jpg");
    expect(facts.ogImageUrl?.value).toContain("6a3d5deec35ec.jpg");
    expect(facts.videoUrl?.value).toBe("https://www.youtube.com/watch?v=nM0qo05eo2M");
    expect(facts.tour360Url).toBeUndefined();
    expect(facts.images).toBeUndefined(); // no curated photo-gallery section exists on this page
  });

  it("16. extracts the real brochure and a separate 'Opportunity Docket' document", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.brochure?.value).toBe("https://www.kalpataru.com/uploads/Kalpataru-Vian-Brochure.pdf");
    expect(facts.documents?.items).toEqual(["https://d2j4tkbto6uvqv.cloudfront.net/kalpataru/1783089933.pdf"]);
  });

  it("17. never fabricates fields genuinely absent from this page (latitude/longitude/address/specifications/faqs/totalUnits/totalTowers)", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.latitude).toBeUndefined();
    expect(facts.longitude).toBeUndefined();
    expect(facts.address).toBeUndefined();
    expect(facts.specifications).toBeUndefined();
    expect(facts.faqs).toBeUndefined();
    expect(facts.totalUnits).toBeUndefined();
    expect(facts.totalTowers).toBeUndefined();
    expect(facts.builder).toBeUndefined();
  });

  it("18. missing optional sections -> those fields simply absent, not fabricated (partial page failure tolerance)", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml({ omit: ["amenities", "downloads", "keyBenefits", "videos"] }));
    expect(facts.amenities).toBeUndefined();
    expect(facts.brochure).toBeUndefined();
    expect(facts.documents).toBeUndefined();
    expect(facts.highlights).toBeUndefined();
    expect(facts.landAreaAcres).toBeUndefined();
    expect(facts.videoUrl).toBeUndefined();
    expect(facts.name?.value).toBe("Kalpataru Vian"); // unrelated fields still extracted
  });

  it("19. malformed JSON-LD doesn't throw -- falls back to whatever other facts were found", () => {
    const html = buildRealShapedHtml({ omit: ["org"] }).replace(
      "<head>",
      '<head><script type="application/ld+json">not valid json at all</script>'
    );
    const facts = extractKalpataruVianFacts(html);
    expect(facts.developerGroup).toBeUndefined();
    expect(facts.name?.value).toBe("Kalpataru Vian");
  });

  it("20. an unrecognized/ambiguous status label is left unmapped rather than guessed", () => {
    const html = buildRealShapedHtml().replace("Status: New Launch", "Status: Under Construction");
    const facts = extractKalpataruVianFacts(html);
    expect(facts.status).toBeUndefined(); // "Under Construction" maps to 3 different ProjectStatus values -- ambiguous, never guessed
  });

  it("21. gracefully returns no facts if the whole markup shape changes unexpectedly, without throwing", () => {
    const facts = extractKalpataruVianFacts("<html><body>nothing here</body></html>");
    expect(Object.keys(facts)).toHaveLength(0);
  });

  it("22. feeding real extracted facts through the EXISTING classifier reproduces a realistic GREEN_NEW/YELLOW/MISSING mix (no staged record exists for this project yet, so nothing can be CONFIRMED/CONFLICT)", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    const BLANK_PAYLOAD = {
      name: "",
      status: "ANNOUNCED" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "kalpataru-vian",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri-west",
    };
    const result = classifyProjectEnrichment(BLANK_PAYLOAD, {}, facts, {
      url: KALPATARU_VIAN_PROJECT_URL,
      tier: "OFFICIAL_DEVELOPER",
    });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("name").classification).toBe("GREEN_NEW");
    expect(byKey("reraNumber").classification).toBe("GREEN_NEW");
    expect(byKey("landAreaAcres").classification).toBe("YELLOW");
    expect(byKey("priceMax").classification).toBe("MISSING");
    expect(byKey("latitude").classification).toBe("MISSING");
    expect(result).toHaveLength(44);
  });

  it("23. never leaks Godrej fixture content into a Kalpataru extraction run", () => {
    const facts = extractKalpataruVianFacts(buildRealShapedHtml());
    expect(facts.name?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.name?.value);
    expect(facts.developerGroup?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.developerGroup?.value);
  });
});

describe("kalpataruAdapter (Phase 38 — real live adapter, third developer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(kalpataruAdapter.resolveDomain("Kalpataru Limited")).toBe("https://www.kalpataru.com");
    expect(kalpataruAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("performs a real fetch and returns extracted facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);
    const facts = await kalpataruAdapter.fetchProjectFacts(KALPATARU_VIAN_PROJECT_URL);
    expect(facts.name?.value).toBe("Kalpataru Vian");
    expect(fetchMock).toHaveBeenCalledWith(
      KALPATARU_VIAN_PROJECT_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("24. throws when the page fetch returns a non-OK status ('adapter failure' / 'unavailable source')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(kalpataruAdapter.fetchProjectFacts(KALPATARU_VIAN_PROJECT_URL)).rejects.toThrow();
  });

  it("25. throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(kalpataruAdapter.fetchProjectFacts(KALPATARU_VIAN_PROJECT_URL)).rejects.toThrow("network down");
  });
});
