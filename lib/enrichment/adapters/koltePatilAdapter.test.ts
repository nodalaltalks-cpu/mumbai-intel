import { afterEach, describe, expect, it, vi } from "vitest";
import { extractKoltePatilFacts, koltePatilAdapter, KOLTE_PATIL_SERENOVA_PROJECT_URL } from "./koltePatilAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of koltepatil.com's actual
 * Serenova (Versova) markup, captured live during Phase 47: MULTIPLE
 * separate `application/ld+json` blocks rather than one, the project's real
 * short name only in the BreadcrumbList's second entry ("Serenova - Kolte
 * Patil") -- NOT the marketing headline used elsewhere on the page -- and
 * the RERA number embedded inside FAQPage answer prose text, not a labeled
 * field.
 */
function buildRealShapedHtml(opts: { projectName: string; description?: string; streetAddress?: string; rera?: string }): string {
  const blocks: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "HomePage", item: "https://www.koltepatil.com/" },
        { "@type": "ListItem", position: 2, name: `${opts.projectName} - Kolte Patil`, item: KOLTE_PATIL_SERENOVA_PROJECT_URL },
      ],
    },
  ];
  if (opts.description) {
    blocks.push({ "@context": "https://schema.org", "@type": "RealEstateListing", name: opts.projectName, description: opts.description });
  }
  if (opts.streetAddress) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "Place",
      address: { "@type": "PostalAddress", streetAddress: opts.streetAddress, addressLocality: "Mumbai" },
    });
  }
  if (opts.rera) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: `What is ${opts.projectName}?`, acceptedAnswer: { "@type": "Answer", text: `The project is registered under MAHA RERA No. ${opts.rera}, ensuring transparency.` } },
      ],
    });
  }

  const scripts = blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n");
  return `<html><head><title>${opts.projectName} Marketing Headline | Kolte Patil</title>${scripts}</head><body></body></html>`;
}

describe("extractKoltePatilFacts (Phase 47 -- eighth developer, multi-block JSON-LD)", () => {
  it("1. extracts the real project short name from the BreadcrumbList, not the marketing headline", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova" });
    const facts = extractKoltePatilFacts(html);
    expect(facts.name?.value).toBe("Serenova");
  });

  it("2. extracts locality from the Place/address JSON-LD block", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova", streetAddress: "Versova" });
    const facts = extractKoltePatilFacts(html);
    expect(facts.locality?.value).toBe("Versova");
  });

  it("3. extracts RERA number embedded inside FAQPage answer prose, not a labeled field", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova", rera: "PR1180002500850" });
    const facts = extractKoltePatilFacts(html);
    expect(facts.reraNumber?.value).toBe("PR1180002500850");
  });

  it("4. parses 'Possession Dec 2028' out of the listing description into month + year", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova", description: "Premium 2 & 3 BHK. Possession Dec 2028." });
    const facts = extractKoltePatilFacts(html);
    expect(facts.possessionMonth?.value).toBe("December");
    expect(facts.possessionYear?.value).toBe("2028");
  });

  it("5. no RERA text anywhere -> reraNumber genuinely MISSING, never fabricated", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova" });
    const facts = extractKoltePatilFacts(html);
    expect(facts.reraNumber).toBeUndefined();
  });

  it("6. a malformed JSON-LD block is skipped without throwing away the rest of the page's real data", () => {
    const html = `<script type="application/ld+json">{not valid json</script>` + buildRealShapedHtml({ projectName: "Serenova", streetAddress: "Versova" });
    expect(() => extractKoltePatilFacts(html)).not.toThrow();
    expect(extractKoltePatilFacts(html).locality?.value).toBe("Versova");
  });

  it("7. real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({ projectName: "Serenova", streetAddress: "Versova", rera: "PR1180002500850" });
    const facts = extractKoltePatilFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Serenova", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Versova" },
      facts,
      { url: KOLTE_PATIL_SERENOVA_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
  });

  it("8. the real adapter throws distinctly on a non-OK fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(koltePatilAdapter.fetchProjectFacts(KOLTE_PATIL_SERENOVA_PROJECT_URL)).rejects.toThrow(/404/);
  });

  afterEach(() => vi.unstubAllGlobals());
});
