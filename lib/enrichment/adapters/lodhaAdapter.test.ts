import { afterEach, describe, expect, it, vi } from "vitest";
import { extractLodhaCullinanFacts, lodhaAdapter, LODHA_CULLINAN_PROJECT_URL } from "./lodhaAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";
import { GODREJ_SKY_SHORE_SOURCE_FACTS } from "../fixtures/godrejSkyShoreSourceFacts";

/**
 * A condensed but structurally REAL replica of lodhagroup.com's actual
 * lodha-cullinan markup, captured live during Phase 42: a Drupal 10 site
 * (confirmed via its own `Generator` meta tag and Drupal settings blob) with
 * NO `__NEXT_DATA__` at all -- the SIXTH distinct page shape now proven,
 * and the first with no embedded JSON payload of any kind (like Kalpataru's
 * page). The one genuinely structured signal is a real FAQPage JSON-LD
 * block, whose raw text contains a literal (unescaped) newline inside one
 * answer string -- a real quirk that makes naive `JSON.parse` throw unless
 * collapsed first. Real content otherwise comes from a "Click here for RERA
 * details" slide-out widget (a real MahaRERA number) and a banner image
 * path under `/sites/default/files/projects/banner/`.
 */
function buildRealShapedHtml(overrides: { omit?: string[]; corruptFaqNewline?: boolean } = {}): string {
  const omit = new Set(overrides.omit ?? []);

  const faqMainEntity = [
    {
      "@type": "Question",
      name: "1. Where is Lodha Cullinan located?",
      acceptedAnswer: {
        "@type": "Answer",
        text: overrides.corruptFaqNewline
          ? "Lodha Cullinan Versova is located off Yari Road, in Versova - one of the city's most well-connected locations with great\ninfrastructure and a constantly evolving skyline."
          : "Lodha Cullinan Versova is located off Yari Road, in Versova - one of the city's most well-connected locations.",
      },
    },
    {
      "@type": "Question",
      name: "2. What typology options does Lodha Cullinan offer?",
      acceptedAnswer: { "@type": "Answer", text: "Lodha Cullinan Versova offers lavish 4BHK residences with terrace like decks." },
    },
    {
      "@type": "Question",
      name: "3. What amenities are available at Lodha Cullinan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Lodha Cullinan offers a gallery of experiences with world-class amenities such as private dining salon, banquet, library café, gym.",
      },
    },
  ];

  const faqLdJsonRaw = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqMainEntity });
  // Simulate the real page's own literal-newline quirk inside the raw HTML
  // source (not inside the JS string escape) when requested.
  const faqLdJson = overrides.corruptFaqNewline ? faqLdJsonRaw.replace("great\\ninfrastructure", "great\ninfrastructure") : faqLdJsonRaw;

  const reraWidget = omit.has("rera")
    ? ""
    : `<div class="slide-out"><div class="slide-out-tab"><span>Click here for <br/>RERA details</span></div>
       <div class="slide-out-content"><p>MahaRERA registration numbers:&nbsp;<br>P51800054551<br><a href="https://maharera.maharashtra.gov.in/">https://maharera.maharashtra.gov.in</a></p></div></div>`;

  const banner = omit.has("banner") ? "" : `<img src="/sites/default/files/projects/banner/spotlight-1903x800.jpg" alt="banner">`;

  return `<!DOCTYPE html><html><head>
    <title>Lodha Cullinan - 4 BHK &amp; 5 BHK Flats in Versova | Lodha Versova</title>
    <meta name="description" content="Lodha Cullinan in Versova offers luxury 4 &amp; 5 BHK flats with lavish sea-view decks and clubhouse with 7-star amenities.">
    <meta name="Generator" content="Drupal 10 (https://www.drupal.org)" />
    ${omit.has("faq") ? "" : `<script type="application/ld+json">${faqLdJson}</script>`}
  </head><body>
    ${banner}
    ${reraWidget}
  </body></html>`;
}

describe("extractLodhaCullinanFacts (Phase 42 — sixth developer, a sixth distinct page shape: Drupal, no embedded JSON)", () => {
  it("1. extracts the real project name from the <title> tag's leading segment", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.name?.value).toBe("Lodha Cullinan");
  });

  it("2. extracts real meta title/description (HTML entities decoded)", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.metaTitle?.value).toContain("4 BHK & 5 BHK Flats");
    expect(facts.metaTitle?.value).not.toContain("&amp;");
  });

  it("3. extracts category as Residential from the page's own BHK text", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.category?.value).toBe("Residential");
  });

  it("4. extracts the real RERA number from the slide-out widget", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.reraNumber?.value).toBe("P51800054551");
  });

  it("5. extracts the real FAQPage structured data as faqs", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.faqs?.items).toEqual([
      "1. Where is Lodha Cullinan located?",
      "2. What typology options does Lodha Cullinan offer?",
      "3. What amenities are available at Lodha Cullinan?",
    ]);
  });

  it("6. a literal newline embedded in the real FAQ JSON-LD text doesn't crash parsing -- collapsed before JSON.parse", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml({ corruptFaqNewline: true }));
    expect(facts.faqs?.items?.length).toBe(3);
    expect(facts.locality?.value).toContain("Yari Road");
  });

  it("7. extracts locality/microMarket from the FAQ 'where is it located' answer, ambiguous/prose-derived", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.locality?.value).toBe("off Yari Road, in Versova");
    expect(facts.locality?.ambiguous).toBe(true);
  });

  it("8. extracts real amenities from the FAQ amenities answer, comma-split", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.amenities?.items).toEqual(["private dining salon", "banquet", "library café", "gym"]);
  });

  it("9. extracts the real cover image from the project banner path", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.coverImage?.value).toBe("https://www.lodhagroup.com/sites/default/files/projects/banner/spotlight-1903x800.jpg");
  });

  it("10. never fabricates a price, possession date, or developerGroup -- this page publishes none", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.priceMin).toBeUndefined();
    expect(facts.possessionMonth).toBeUndefined();
    expect(facts.developerGroup).toBeUndefined();
  });

  it("11. missing optional sections -> those fields simply absent, not fabricated (partial page failure tolerance)", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml({ omit: ["rera", "banner"] }));
    expect(facts.reraNumber).toBeUndefined();
    expect(facts.coverImage).toBeUndefined();
    expect(facts.name?.value).toBe("Lodha Cullinan"); // unrelated fields still extracted
  });

  it("12. malformed/missing FAQ JSON-LD doesn't throw -- falls back to whatever other facts were found", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml({ omit: ["faq"] }));
    expect(facts.faqs).toBeUndefined();
    expect(facts.locality).toBeUndefined();
    expect(facts.amenities).toBeUndefined();
    expect(facts.name?.value).toBe("Lodha Cullinan");
    expect(facts.reraNumber?.value).toBe("P51800054551");
  });

  it("13. gracefully returns no facts if the whole markup shape changes unexpectedly, without throwing", () => {
    const facts = extractLodhaCullinanFacts("<html><body>nothing here</body></html>");
    expect(Object.keys(facts)).toHaveLength(0);
  });

  it("14. feeding real extracted facts through the EXISTING classifier reproduces a realistic GREEN_NEW/YELLOW/MISSING mix", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    const BLANK_PAYLOAD = {
      name: "",
      status: "ANNOUNCED" as const,
      category: "RESIDENTIAL" as const,
      sourceRef: "lodha-cullinan",
      dataSource: "EXTERNAL_OPEN_DATA" as const,
      localityId: "loc-andheri-west",
    };
    const result = classifyProjectEnrichment(BLANK_PAYLOAD, {}, facts, { url: LODHA_CULLINAN_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" });
    const byKey = (k: string) => result.find((f) => f.key === k)!;
    expect(byKey("reraNumber").classification).toBe("GREEN_NEW");
    expect(byKey("locality").classification).toBe("YELLOW"); // ambiguous, blank current -> YELLOW
    expect(byKey("priceMin").classification).toBe("MISSING");
    expect(result).toHaveLength(38);
  });

  it("15. never leaks Godrej fixture content into a Lodha extraction run", () => {
    const facts = extractLodhaCullinanFacts(buildRealShapedHtml());
    expect(facts.name?.value).not.toBe(GODREJ_SKY_SHORE_SOURCE_FACTS.name?.value);
  });
});

describe("lodhaAdapter (Phase 42 — real live adapter, sixth developer)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDomain delegates to the shared curated registry", () => {
    expect(lodhaAdapter.resolveDomain("Lodha")).toBe("https://www.lodhagroup.com");
    expect(lodhaAdapter.resolveDomain("Some Random Builder")).toBeNull();
  });

  it("performs a real fetch and returns extracted facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => buildRealShapedHtml() });
    vi.stubGlobal("fetch", fetchMock);
    const facts = await lodhaAdapter.fetchProjectFacts(LODHA_CULLINAN_PROJECT_URL);
    expect(facts.name?.value).toBe("Lodha Cullinan");
  });

  it("16. throws when the page fetch returns a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    await expect(lodhaAdapter.fetchProjectFacts(LODHA_CULLINAN_PROJECT_URL)).rejects.toThrow();
  });

  it("17. throws when the fetch itself rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(lodhaAdapter.fetchProjectFacts(LODHA_CULLINAN_PROJECT_URL)).rejects.toThrow("network down");
  });
});
