import { afterEach, describe, expect, it, vi } from "vitest";
import { extractShapoorjiPallonjiFacts, shapoorjiPallonjiAdapter, SP_HEARTLAND_PROJECT_URL } from "./shapoorjiPallonjiAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of shapoorjirealestate.com's
 * actual project-page markup, captured live during Phase 53 across 6 real
 * pages: a `data-project-location` attribute on `<html>`, one-or-more
 * `application/ld+json` blocks (sometimes a flat Product, sometimes an
 * `@graph` array), a real RERA number as page-wide plain text (not always
 * inside JSON-LD), and an optional real `FAQPage` block where status
 * sometimes lives as FAQ prose.
 */
function buildRealShapedHtml(opts: {
  htmlAttrLocation?: string;
  jsonLdNodes?: object[];
  useGraph?: boolean;
  reraNumbers?: string[];
  faqAnswers?: string[];
}): string {
  const scripts: string[] = [];
  if (opts.jsonLdNodes) {
    if (opts.useGraph) {
      scripts.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": opts.jsonLdNodes })}</script>`);
    } else {
      for (const node of opts.jsonLdNodes) scripts.push(`<script type="application/ld+json">${JSON.stringify(node)}</script>`);
    }
  }
  if (opts.faqAnswers) {
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: opts.faqAnswers.map((text, i) => ({ "@type": "Question", name: `Question ${i}`, acceptedAnswer: { "@type": "Answer", text } })),
    };
    scripts.push(`<script type="application/ld+json">${JSON.stringify(faq)}</script>`);
  }

  const reraText = (opts.reraNumbers ?? []).map((n) => `<p>RERA Number: ${n}</p>`).join("\n");
  const htmlAttr = opts.htmlAttrLocation ? ` data-project-location="${opts.htmlAttrLocation}"` : "";

  return `<html lang="en"${htmlAttr}><head>${scripts.join("\n")}</head><body>${reraText}</body></html>`;
}

describe("extractShapoorjiPallonjiFacts (Phase 53 -- twelfth developer, structurally inconsistent pages sharing ONE adapter)", () => {
  it("1. extracts name from a flat Product node (BKC 9 / BKC 28 / Nine Arcs shape, no @graph)", () => {
    const html = buildRealShapedHtml({ jsonLdNodes: [{ "@context": "https://schema.org", "@type": "Product", name: "Shapoorji Pallonji BKC 9" }] });
    expect(extractShapoorjiPallonjiFacts(html).name?.value).toBe("Shapoorji Pallonji BKC 9");
  });

  it("2. extracts name from an ApartmentComplex node inside @graph, preferred over a sibling Product node (Heartland shape)", () => {
    const html = buildRealShapedHtml({
      useGraph: true,
      jsonLdNodes: [
        { "@type": "ApartmentComplex", name: "Shapoorji Pallonji Heartland" },
        { "@type": "Product", name: "Shapoorji Pallonji Heartland Mulund West" },
      ],
    });
    expect(extractShapoorjiPallonjiFacts(html).name?.value).toBe("Shapoorji Pallonji Heartland");
  });

  it("3. locality priority 1 -- additionalProperty 'Location' wins even when a coarser addressLocality is also present", () => {
    const html = buildRealShapedHtml({
      useGraph: true,
      jsonLdNodes: [{ "@type": "ApartmentComplex", name: "Nine Arcs", address: { addressLocality: "Mumbai" }, additionalProperty: [{ name: "Location", value: "Santacruz East, Mumbai" }] }],
    });
    expect(extractShapoorjiPallonjiFacts(html).locality?.value).toBe("Santacruz East, Mumbai");
  });

  it("4. locality priority 2 -- falls back to address.addressLocality when no additionalProperty Location exists", () => {
    const html = buildRealShapedHtml({ useGraph: true, jsonLdNodes: [{ "@type": "ApartmentComplex", name: "Heartland", address: { addressLocality: "Mulund West" } }] });
    expect(extractShapoorjiPallonjiFacts(html).locality?.value).toBe("Mulund West");
  });

  it("5. locality priority 3 -- the REAL BKC 9/BKC 28 finding: no address field at all in JSON-LD, falls back to the site-wide data-project-location HTML attribute", () => {
    const html = buildRealShapedHtml({ htmlAttrLocation: "Mumbai", jsonLdNodes: [{ "@type": "Product", name: "Shapoorji Pallonji BKC 9" }] });
    const locality = extractShapoorjiPallonjiFacts(html).locality;
    expect(locality?.value).toBe("Mumbai");
    expect(locality?.confidence).toBe("Medium");
  });

  it("6. a single RERA number (found as page-wide plain text, not in JSON-LD) extracts cleanly and is NOT ambiguous", () => {
    const html = buildRealShapedHtml({ reraNumbers: ["P51800054573"] });
    const facts = extractShapoorjiPallonjiFacts(html);
    expect(facts.reraNumber?.value).toBe("P51800054573");
    expect(facts.reraNumber?.ambiguous).toBeFalsy();
  });

  it("7. the REAL Codename NP 1.2 finding -- two distinct wing RERA numbers (a 'PM...' format) capture the first and flag ambiguous", () => {
    const html = buildRealShapedHtml({ reraNumbers: ["PM1181012503066", "PM1181012503072"] });
    const facts = extractShapoorjiPallonjiFacts(html);
    expect(facts.reraNumber?.value).toBe("PM1181012503066");
    expect(facts.reraNumber?.ambiguous).toBe(true);
    expect(facts.reraNumber?.note).toContain("2 distinct");
  });

  it("8. a 'PR...' format RERA number (the real Nine Arcs shape) is also recognized", () => {
    const html = buildRealShapedHtml({ reraNumbers: ["PR1180002502933"] });
    expect(extractShapoorjiPallonjiFacts(html).reraNumber?.value).toBe("PR1180002502933");
  });

  it("9. no RERA text anywhere on the page -> reraNumber genuinely MISSING, never fabricated", () => {
    const html = buildRealShapedHtml({ jsonLdNodes: [{ "@type": "Product", name: "Example" }] });
    expect(extractShapoorjiPallonjiFacts(html).reraNumber).toBeUndefined();
  });

  it("10. the REAL BKC 9 finding -- status only ever exists as FAQ prose ('...is under construction...'), extracted and mapped to UNDER_CONSTRUCTION", () => {
    const html = buildRealShapedHtml({ faqAnswers: ["As of August 2024, BKC 9 is under construction, with excavation completed and work on the raft foundation in progress."] });
    const status = extractShapoorjiPallonjiFacts(html).status;
    expect(status?.value).toBe("Under Construction");
    expect(status?.confidence).toBe("High");
  });

  it("11. an FAQ answer mentioning 'ready to move' maps to READY_TO_MOVE", () => {
    const html = buildRealShapedHtml({ faqAnswers: ["This project is ready to move in immediately."] });
    expect(extractShapoorjiPallonjiFacts(html).status?.value).toBe("Ready to Move");
  });

  it("12. no FAQPage at all (the real Heartland/Nine Arcs/BKC 28 finding) -> status genuinely MISSING, never guessed from the index page's own category label", () => {
    const html = buildRealShapedHtml({ jsonLdNodes: [{ "@type": "ApartmentComplex", name: "Heartland" }] });
    expect(extractShapoorjiPallonjiFacts(html).status).toBeUndefined();
  });

  it("13. extracts amenities as a real named list, filtering out an explicit value:false entry", () => {
    const html = buildRealShapedHtml({
      useGraph: true,
      jsonLdNodes: [{ "@type": "ApartmentComplex", name: "Heartland", amenityFeature: [{ name: "Swimming Pool" }, { name: "Gym", value: true }, { name: "Helipad", value: false }] }],
    });
    const facts = extractShapoorjiPallonjiFacts(html);
    expect(facts.amenities?.items).toEqual(["Swimming Pool", "Gym"]);
  });

  it("14. extracts a starting price and formats it in Crores", () => {
    const html = buildRealShapedHtml({ jsonLdNodes: [{ "@type": "Product", name: "Heartland", offers: { price: "17100000" } }] });
    expect(extractShapoorjiPallonjiFacts(html).priceMin?.value).toBe("₹1.71 Cr");
  });

  it("15. a malformed JSON-LD block is skipped without throwing away the rest of the page's real data", () => {
    const html = `<script type="application/ld+json">{not valid json</script>` + buildRealShapedHtml({ jsonLdNodes: [{ "@type": "Product", name: "Heartland" }] });
    expect(() => extractShapoorjiPallonjiFacts(html)).not.toThrow();
    expect(extractShapoorjiPallonjiFacts(html).name?.value).toBe("Heartland");
  });

  it("16. real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({
      useGraph: true,
      jsonLdNodes: [{ "@type": "ApartmentComplex", name: "Shapoorji Pallonji Heartland", address: { addressLocality: "Mulund West" } }],
      reraNumbers: ["P51800005668"],
    });
    const facts = extractShapoorjiPallonjiFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Shapoorji Pallonji Heartland", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Mulund West" },
      facts,
      { url: SP_HEARTLAND_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
    expect(fields.find((f) => f.key === "locality")?.classification).toBe("CONFIRMED");
  });

  it("17. the real adapter throws distinctly on a non-OK fetch (SOURCE_UNAVAILABLE contract)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(shapoorjiPallonjiAdapter.fetchProjectFacts(SP_HEARTLAND_PROJECT_URL)).rejects.toThrow(/503/);
  });

  it("18. a wrong/unrelated project URL still only returns whatever THAT page's own JSON-LD says -- the adapter never assumes a name", () => {
    const html = buildRealShapedHtml({ jsonLdNodes: [{ "@type": "Product", name: "Shapoorji Pallonji BKC 28" }] });
    const facts = extractShapoorjiPallonjiFacts(html);
    expect(facts.name?.value).toBe("Shapoorji Pallonji BKC 28");
    expect(facts.name?.value).not.toBe("Shapoorji Pallonji Heartland");
  });

  afterEach(() => vi.unstubAllGlobals());
});
