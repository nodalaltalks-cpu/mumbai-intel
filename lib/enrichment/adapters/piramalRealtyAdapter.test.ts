import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPiramalRealtyFacts, piramalRealtyAdapter, PIRAMAL_MAHALAXMI_PROJECT_URL } from "./piramalRealtyAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of piramalrealty.com's actual
 * project-page markup, captured live during Phase 54 across all 3 real
 * pages: an ApartmentComplex node, a generic RealEstateListing node (always
 * coarse "Mumbai" locality), a SEPARATE LocalBusiness node (the real
 * specific-locality source, matched by @id), a real FAQPage, and one RERA
 * number per real tower as page-wide plain text.
 */
function buildRealShapedHtml(opts: {
  apartmentComplex?: object;
  realEstateListingLocality?: string;
  localBusinessAddress?: { addressLocality?: string; streetAddress?: string };
  reraNumbers?: string[];
  faqAnswers?: string[];
}): string {
  const scripts: string[] = [];
  if (opts.apartmentComplex) scripts.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "ApartmentComplex", ...opts.apartmentComplex })}</script>`);
  if (opts.realEstateListingLocality) {
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "RealEstateListing", address: { "@type": "PostalAddress", addressLocality: opts.realEstateListingLocality } })}</script>`
    );
  }
  if (opts.localBusinessAddress) {
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": ["LocalBusiness", "RealEstateAgent"],
        "@id": "https://www.piramalrealty.com/project-example#localbusiness",
        address: { "@type": "PostalAddress", ...opts.localBusinessAddress },
      })}</script>`
    );
  }
  if (opts.faqAnswers) {
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: opts.faqAnswers.map((text, i) => ({ "@type": "Question", name: `Question ${i}`, acceptedAnswer: { "@type": "Answer", text } })),
    };
    scripts.push(`<script type="application/ld+json">${JSON.stringify(faq)}</script>`);
  }

  const reraText = (opts.reraNumbers ?? []).map((n) => `<p>MahaRERA ${n}</p>`).join("\n");

  return `<html lang="en"><head>${scripts.join("\n")}</head><body>${reraText}</body></html>`;
}

describe("extractPiramalRealtyFacts (Phase 54 -- thirteenth developer, real multi-tower JSON-LD pages)", () => {
  it("1. extracts name from the ApartmentComplex node", () => {
    const html = buildRealShapedHtml({ apartmentComplex: { name: "Piramal Mahalaxmi" } });
    expect(extractPiramalRealtyFacts(html).name?.value).toBe("Piramal Mahalaxmi");
  });

  it("2. locality -- the REAL finding: uses the LocalBusiness node's specific locality, never the generic RealEstateListing node's coarse 'Mumbai'", () => {
    const html = buildRealShapedHtml({
      realEstateListingLocality: "Mumbai",
      localBusinessAddress: { addressLocality: "Byculla", streetAddress: "593, Rambhau Bhogale Marg, Byculla East, Mumbai" },
    });
    const locality = extractPiramalRealtyFacts(html).locality;
    expect(locality?.value).toBe("Byculla East");
  });

  it("3. locality -- the REAL Mulund finding: bare 'Mulund' LocalBusiness locality is refined to 'Mulund West' using the same node's own street address", () => {
    const html = buildRealShapedHtml({
      localBusinessAddress: { addressLocality: "Mulund", streetAddress: "Gate No. 3, near Nirmal Lifestyle Mall, Mulund West, Mumbai" },
    });
    const locality = extractPiramalRealtyFacts(html).locality;
    expect(locality?.value).toBe("Mulund West");
    expect(locality?.note).toContain("Directional suffix");
  });

  it("4. locality -- no directional suffix in the street address -> the bare LocalBusiness locality is used as-is, never invented", () => {
    const html = buildRealShapedHtml({ localBusinessAddress: { addressLocality: "Mahalaxmi", streetAddress: "G Babu Sakpal Rd, Dhobi Ghat, Shanti Nagar, Lower Parel, Mumbai" } });
    expect(extractPiramalRealtyFacts(html).locality?.value).toBe("Mahalaxmi");
  });

  it("5. a single RERA number extracts cleanly and is NOT ambiguous", () => {
    const facts = extractPiramalRealtyFacts(buildRealShapedHtml({ reraNumbers: ["P51900021057"] }));
    expect(facts.reraNumber?.value).toBe("P51900021057");
    expect(facts.reraNumber?.ambiguous).toBeFalsy();
  });

  it("6. the REAL Aranya finding -- four distinct per-tower RERA numbers capture the first and flag ambiguous", () => {
    const facts = extractPiramalRealtyFacts(buildRealShapedHtml({ reraNumbers: ["P51900003324", "P51900018039", "P51900020330", "P51900051735"] }));
    expect(facts.reraNumber?.value).toBe("P51900003324");
    expect(facts.reraNumber?.ambiguous).toBe(true);
    expect(facts.reraNumber?.note).toContain("4 distinct");
  });

  it("7. status -- the REAL Aranya finding: FAQ prose literally saying 'under construction' maps to UNDER_CONSTRUCTION", () => {
    const facts = extractPiramalRealtyFacts(
      buildRealShapedHtml({ faqAnswers: ["Ahan I (under construction, MahaRERA P51900020330) and Ahan II (under construction, MahaRERA P51900051735)."] })
    );
    expect(facts.status?.value).toBe("Under Construction");
    expect(facts.status?.confidence).toBe("High");
  });

  it("8. status -- the REAL Mahalaxmi finding: 'topped out' + 'finishings are underway' (no literal 'under construction') still maps to UNDER_CONSTRUCTION", () => {
    const facts = extractPiramalRealtyFacts(
      buildRealShapedHtml({ faqAnswers: ["South and Central Towers are delivered (Occupancy Certificate received); North Tower has topped out and finishings are underway."] })
    );
    expect(facts.status?.value).toBe("Under Construction");
  });

  it("9. status -- 'topped out' alone with no finishing/underway language does not fabricate a status", () => {
    const facts = extractPiramalRealtyFacts(buildRealShapedHtml({ faqAnswers: ["The tower has topped out."] }));
    expect(facts.status).toBeUndefined();
  });

  it("10. status -- an FAQ that only ever says towers are delivered, with no active-tower evidence, is genuinely MISSING rather than guessed as Ready to Move", () => {
    const facts = extractPiramalRealtyFacts(buildRealShapedHtml({ faqAnswers: ["All four towers have been delivered to residents with Occupancy Certificates received."] }));
    expect(facts.status).toBeUndefined();
  });

  it("11. extracts amenities as a real named list, filtering out an explicit value:false entry", () => {
    const facts = extractPiramalRealtyFacts(
      buildRealShapedHtml({ apartmentComplex: { name: "Piramal Mahalaxmi", amenityFeature: [{ name: "Infinity-Edged Swimming Pool" }, { name: "Jacuzzi", value: true }, { name: "Helipad", value: false }] } })
    );
    expect(facts.amenities?.items).toEqual(["Infinity-Edged Swimming Pool", "Jacuzzi"]);
  });

  it("12. no RERA text anywhere on the page -> reraNumber genuinely MISSING, never fabricated", () => {
    expect(extractPiramalRealtyFacts(buildRealShapedHtml({ apartmentComplex: { name: "Example" } })).reraNumber).toBeUndefined();
  });

  it("13. a malformed JSON-LD block is skipped without throwing away the rest of the page's real data", () => {
    const html = `<script type="application/ld+json">{not valid json</script>` + buildRealShapedHtml({ apartmentComplex: { name: "Piramal Mahalaxmi" } });
    expect(() => extractPiramalRealtyFacts(html)).not.toThrow();
    expect(extractPiramalRealtyFacts(html).name?.value).toBe("Piramal Mahalaxmi");
  });

  it("14. real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({
      apartmentComplex: { name: "Piramal Mahalaxmi" },
      localBusinessAddress: { addressLocality: "Mahalaxmi" },
      reraNumbers: ["P51900021057"],
    });
    const facts = extractPiramalRealtyFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Piramal Mahalaxmi", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Mahalaxmi" },
      facts,
      { url: PIRAMAL_MAHALAXMI_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
    expect(fields.find((f) => f.key === "locality")?.classification).toBe("CONFIRMED");
  });

  it("15. the real adapter throws distinctly on a non-OK fetch (SOURCE_UNAVAILABLE contract)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(piramalRealtyAdapter.fetchProjectFacts(PIRAMAL_MAHALAXMI_PROJECT_URL)).rejects.toThrow(/503/);
  });

  it("16. a wrong/unrelated project page still only returns whatever THAT page's own JSON-LD says -- the adapter never assumes a name", () => {
    const facts = extractPiramalRealtyFacts(buildRealShapedHtml({ apartmentComplex: { name: "Piramal Revanta" } }));
    expect(facts.name?.value).toBe("Piramal Revanta");
    expect(facts.name?.value).not.toBe("Piramal Mahalaxmi");
  });

  afterEach(() => vi.unstubAllGlobals());
});
