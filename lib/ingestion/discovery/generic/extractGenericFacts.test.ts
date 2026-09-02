import { describe, expect, it } from "vitest";
import { extractGenericProjectFacts, assessProjectNameQuality } from "./extractGenericFacts";

function withJsonLd(node: object, restOfHtml = ""): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body>${restOfHtml}</body></html>`;
}

describe("extractGenericProjectFacts", () => {
  it("extracts name/address from a real-shaped ApartmentComplex JSON-LD node (High confidence)", () => {
    const html = withJsonLd({
      "@context": "https://schema.org",
      "@type": "ApartmentComplex",
      name: "Test Towers",
      description: "A fine residential tower.",
      address: { "@type": "PostalAddress", addressLocality: "Andheri West", streetAddress: "Link Road, Andheri West" },
    });
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Test Towers");
    expect(facts.projectNameSource).toBe("json_ld");
    expect(facts.confidence).toBe("High");
    expect(facts.areaTextGuess).toContain("Andheri West");
    expect(facts.hasProjectLikeJsonLd).toBe(true);
  });

  it("falls back to og:title when there is no project-shaped JSON-LD (Medium confidence)", () => {
    const html = `<html><head><meta property="og:title" content="Test Heights | Example Developer" /></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Test Heights");
    expect(facts.projectNameSource).toBe("og_title");
    expect(facts.confidence).toBe("Medium");
  });

  it("falls back to the <title> tag when there is no JSON-LD and no og:title", () => {
    const html = `<html><head><title>Test Residences - Example Developer</title></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Test Residences");
    expect(facts.projectNameSource).toBe("title_tag");
    expect(facts.confidence).toBe("Medium");
  });

  it("returns Low confidence and a null name when nothing usable is present", () => {
    const facts = extractGenericProjectFacts("<html><head></head><body>No structured data here.</body></html>");
    expect(facts.projectNameGuess).toBeNull();
    expect(facts.confidence).toBe("Low");
    expect(facts.hasProjectLikeJsonLd).toBe(false);
  });

  it("extracts a RERA number appearing as page-wide text", () => {
    const html = withJsonLd({ "@type": "ApartmentComplex", name: "Test Towers" }, "MahaRERA: P51800012345");
    expect(extractGenericProjectFacts(html).reraNumber).toBe("P51800012345");
  });

  it("finds an explicit status evidence phrase", () => {
    const html = withJsonLd({ "@type": "ApartmentComplex", name: "Test Towers", description: "This project is currently under construction." });
    expect(extractGenericProjectFacts(html).statusEvidenceText).toBe("under construction");
  });

  it("never throws on a malformed JSON-LD block", () => {
    const html = `<html><head><script type="application/ld+json">{not valid json</script></head><body><title>Fallback Title</title></body></html>`;
    expect(() => extractGenericProjectFacts(html)).not.toThrow();
  });

  it("handles a @graph-wrapped JSON-LD document", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Some Developer" },
        { "@type": "ApartmentComplex", name: "Graph Towers", address: { addressLocality: "Powai" } },
      ],
    })}</script></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Graph Towers");
    expect(facts.areaTextGuess).toBe("Powai");
  });

  // --- Phase 56 Part A: ranked locality evidence beyond JSON-LD address ---

  it("extracts locality evidence from the <title> tag when there is no JSON-LD address", () => {
    const html = `<html><head><title>Tower A — 3 BHK Homes in Mulund West | Test Developer</title></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    const titleEvidence = facts.areaEvidence.find((e) => e.source === "title_tag");
    expect(titleEvidence?.text).toContain("Mulund West");
  });

  it("extracts locality evidence from og:title when there is no JSON-LD address", () => {
    const html = `<html><head><meta property="og:title" content="Homes for sale, Chembur, Mumbai" /></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    const ogEvidence = facts.areaEvidence.find((e) => e.source === "og_title");
    expect(ogEvidence?.text).toContain("Chembur");
  });

  it("extracts locality evidence from the page's own fetched URL slug", () => {
    const html = `<html><head></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html, "https://d.com/residential/tower-a-mulund-west");
    const slugEvidence = facts.areaEvidence.find((e) => e.source === "url_slug");
    expect(slugEvidence?.text).toBe("tower a mulund west");
  });

  it("ranks a JSON-LD address ABOVE a conflicting title guess when both are present", () => {
    const html = withJsonLd(
      { "@type": "ApartmentComplex", name: "Test Towers", address: { addressLocality: "Andheri West" } },
      ""
    ).replace("<body>", "<title>Test Towers — Homes in Chembur</title><body>");
    const facts = extractGenericProjectFacts(html);
    expect(facts.areaEvidence[0].source).toBe("json_ld_address");
    expect(facts.areaEvidence[0].text).toContain("Andheri West");
  });

  // --- Phase 56 Part C: status must come from project-specific evidence, never sitewide chrome ---

  it("ignores a sitewide status widget's phrase, but still finds genuine project-specific status text", () => {
    const html = `<html><head></head><body>
      <header><div class="status-widget">Under Construction</div></header>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "ApartmentComplex",
        name: "Test Towers",
        description: "This is a New Launch project this festive season.",
      })}</script>
    </body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.statusEvidenceText).toBe("new launch");
  });

  it("still finds a genuine project-specific 'Under Construction' phrase outside any sitewide chrome", () => {
    const html = `<html><head></head><body>
      <script type="application/ld+json">${JSON.stringify({ "@type": "ApartmentComplex", name: "Test Towers" })}</script>
      <div class="project-details">Currently Under Construction — possession soon.</div>
    </body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.statusEvidenceText).toBe("under construction");
  });

  it("strips header/nav/footer chrome entirely before scanning for status phrases", () => {
    const html = `<html><head></head><body>
      <nav>Sold Out — see other properties</nav>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "ApartmentComplex",
        name: "Test Towers",
        description: "Now Launched — book your home today.",
      })}</script>
      <footer>Delivered projects: 40+</footer>
    </body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.statusEvidenceText).toBe("now launched");
  });

  // --- Phase 56 Part D: project-name quality gate ---

  it("rejects a marketing-sentence JSON-LD name and falls back to a clean title (the real 'garbled Piramal Revanta' case)", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "ApartmentComplex",
        name: "Discover a home that redefines luxury living in the city.",
        address: { addressLocality: "Mulund West" },
      })}</script>
      <title>Piramal Revanta | Piramal Realty</title>
    </head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Piramal Revanta");
    expect(facts.projectNameSource).toBe("title_tag");
  });

  it("Phase 56 Part D — a garbled JSON-LD name that now falls through to a clean title no longer bypasses duplicate detection", async () => {
    const { findPossibleDuplicateProject } = await import("@/lib/ingestion/duplicateMatch");
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "ApartmentComplex",
        name: "Experience a life reimagined amidst nature and luxury today.",
        address: { addressLocality: "Mulund West" },
      })}</script>
      <title>Piramal Revanta | Piramal Realty</title>
    </head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    const existing = [{ id: "p1", name: "Piramal Revanta", localityId: "loc-mulund-west", reraNumber: null }];
    const dup = findPossibleDuplicateProject(existing, { name: facts.projectNameGuess!, localityId: "loc-mulund-west" });
    expect(dup?.existingId).toBe("p1");
  });
});

describe("decodeHtmlEntities applied at extraction (Phase 56 rerun regression)", () => {
  it("decodes a real raw HTML entity in the <title> tag rather than leaking '&amp;' into the project name", () => {
    const html = `<html><head><title>Luxurious 3 &amp; 4 BHK Flats in Vile Parle West - Vansham by Chandak Group</title></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.areaTextGuess).not.toContain("&amp;");
    expect(facts.areaTextGuess).toContain("3 & 4 BHK");
  });
});

describe("assessProjectNameQuality (Phase 56 Part D)", () => {
  it("accepts a normal, clean project name", () => {
    expect(assessProjectNameQuality("Piramal Revanta").ok).toBe(true);
  });

  it("accepts a legitimately long real project name rather than rejecting on length alone", () => {
    expect(assessProjectNameQuality("Lodha Park Vista Grande Residences Phase II").ok).toBe(true);
  });

  it("rejects a marketing sentence ending in terminal punctuation", () => {
    expect(assessProjectNameQuality("Discover a home that redefines luxury living in the city.").ok).toBe(false);
  });

  it("rejects a cookie-consent banner label", () => {
    expect(assessProjectNameQuality("We use cookies to improve your experience").ok).toBe(false);
  });

  it("rejects a bare navigation label", () => {
    expect(assessProjectNameQuality("Home").ok).toBe(false);
    expect(assessProjectNameQuality("Contact Us").ok).toBe(false);
  });

  it("rejects an implausibly long/garbled string", () => {
    expect(assessProjectNameQuality("A".repeat(120)).ok).toBe(false);
  });

  it("rejects a developer blog's boilerplate og:title (real MICL 'MICL Blog' repeated across every article page in the Phase 56 rerun)", () => {
    expect(assessProjectNameQuality("MICL Blog").ok).toBe(false);
  });
});

describe("titleSegments hyphen handling (Phase 56 rerun regression)", () => {
  it("does NOT split a compound mid-word hyphen with no surrounding whitespace, only falling through the whole junk-shaped phrase (real Adani Realty 'Ready-to-Move Flats in Mumbai' title that previously mis-extracted as the meaningless fragment 'Ready')", () => {
    const html = `<html><head><title>Ready-to-Move Flats in Mumbai PCIC</title></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBeNull();
  });

  it("still splits on a real space-padded hyphen separator", () => {
    const html = `<html><head><title>Piramal Mahalaxmi - Piramal Realty</title></head><body></body></html>`;
    const facts = extractGenericProjectFacts(html);
    expect(facts.projectNameGuess).toBe("Piramal Mahalaxmi");
  });
});
