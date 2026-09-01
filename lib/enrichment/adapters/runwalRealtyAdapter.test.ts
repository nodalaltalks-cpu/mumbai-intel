import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRunwalRealtyFacts, runwalRealtyAdapter, RUNWAL_SANCTUARY_PROJECT_URL } from "./runwalRealtyAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of runwalrealty.com's actual
 * Runwal Sanctuary (Mulund West) markup, captured live during Phase 48:
 * MULTIPLE separate `application/ld+json` blocks, a RealEstateListing with
 * `about.address.addressLocality` for locality and `identifier.value`
 * holding a MULTI-TOWER MahaRERA string, and a separate ApartmentComplex
 * block with `additionalProperty` for BHK configuration.
 */
function buildRealShapedHtml(opts: { name: string; description?: string; addressLocality?: string; reraValue?: string; bhk?: string }): string {
  const blocks: object[] = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Runwal Realty" },
  ];
  const listing: Record<string, unknown> = { "@context": "https://schema.org", "@type": "RealEstateListing", name: opts.name };
  if (opts.description) listing.description = opts.description;
  if (opts.addressLocality) listing.about = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: opts.addressLocality } };
  if (opts.reraValue) listing.identifier = { "@type": "PropertyValue", propertyID: "MahaRERA", value: opts.reraValue };
  blocks.push(listing);
  if (opts.bhk) {
    blocks.push({ "@context": "https://schema.org/", "@type": "ApartmentComplex", name: opts.name, additionalProperty: { "@type": "PropertyValue", name: "BHK", value: opts.bhk } });
  }
  const scripts = blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n");
  return `<html><head>${scripts}</head><body></body></html>`;
}

describe("extractRunwalRealtyFacts (Phase 48 -- ninth developer, multi-block JSON-LD with a multi-tower RERA field)", () => {
  it("1. extracts the real project name from RealEstateListing.name", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary" });
    expect(extractRunwalRealtyFacts(html).name?.value).toBe("Runwal Sanctuary");
  });

  it("2. extracts locality from about.address.addressLocality", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary", addressLocality: "Mulund West" });
    expect(extractRunwalRealtyFacts(html).locality?.value).toBe("Mulund West");
  });

  it("3. a single-tower RERA value extracts cleanly and is NOT marked ambiguous", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary", reraValue: "P51800032538" });
    const facts = extractRunwalRealtyFacts(html);
    expect(facts.reraNumber?.value).toBe("P51800032538");
    expect(facts.reraNumber?.ambiguous).toBeFalsy();
  });

  it("4. a real multi-tower RERA string captures the FIRST registration number and flags ambiguous, never silently merging or dropping the rest", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary", reraValue: "TOWER 2 ~ P51800032538, TOWER 4 ~ P51800025926, TOWER 5 ~ P51800029440" });
    const facts = extractRunwalRealtyFacts(html);
    expect(facts.reraNumber?.value).toBe("P51800032538");
    expect(facts.reraNumber?.ambiguous).toBe(true);
    expect(facts.reraNumber?.note).toContain("MULTIPLE tower registrations");
  });

  it("5. no RERA identifier block at all -> reraNumber genuinely MISSING, never fabricated", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary" });
    expect(extractRunwalRealtyFacts(html).reraNumber).toBeUndefined();
  });

  it("6. extracts BHK configuration from the separate ApartmentComplex block", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary", bhk: "2, 3, 4 Bed Residences" });
    expect(extractRunwalRealtyFacts(html).highlights?.value).toBe("Configuration: 2, 3, 4 Bed Residences");
  });

  it("7. a malformed JSON-LD block is skipped without throwing away the rest of the page's real data", () => {
    const html = `<script type="application/ld+json">{not valid json</script>` + buildRealShapedHtml({ name: "Runwal Sanctuary", addressLocality: "Mulund West" });
    expect(() => extractRunwalRealtyFacts(html)).not.toThrow();
    expect(extractRunwalRealtyFacts(html).locality?.value).toBe("Mulund West");
  });

  it("8. real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({ name: "Runwal Sanctuary", addressLocality: "Mulund West", reraValue: "P51800032538" });
    const facts = extractRunwalRealtyFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Runwal Sanctuary", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Mulund West" },
      facts,
      { url: RUNWAL_SANCTUARY_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
    expect(fields.find((f) => f.key === "locality")?.classification).toBe("CONFIRMED");
  });

  it("9. the real adapter throws distinctly on a non-OK fetch (SOURCE_UNAVAILABLE contract)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(runwalRealtyAdapter.fetchProjectFacts(RUNWAL_SANCTUARY_PROJECT_URL)).rejects.toThrow(/503/);
  });

  it("10. a wrong/unrelated project URL still only returns whatever THAT page's own JSON-LD says -- the adapter never assumes a name", () => {
    const html = buildRealShapedHtml({ name: "Runwal Zenith", addressLocality: "Kanjurmarg" });
    const facts = extractRunwalRealtyFacts(html);
    expect(facts.name?.value).toBe("Runwal Zenith");
    expect(facts.name?.value).not.toBe("Runwal Sanctuary");
  });

  afterEach(() => vi.unstubAllGlobals());
});
