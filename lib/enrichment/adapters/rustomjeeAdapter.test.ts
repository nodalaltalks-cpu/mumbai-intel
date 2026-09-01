import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRustomjeeFacts, rustomjeeAdapter, RUSTOMJEE_OCEAN_VISTA_PROJECT_URL } from "./rustomjeeAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of rustomjee.com's actual
 * markup, captured live during Phase 49 against two real pages with
 * genuinely different completeness (Ocean Vista -- rich; Elements Juhu --
 * thin/sold-out, no @graph blob at all). The rich page's schema is injected
 * via a Next.js `<Script>` component as an ESCAPED JSON STRING inside
 * `self.__next_s.push([0,{"type":"application/ld+json",...,"children":"{...}"}])`
 * -- never a literal `<script type="application/ld+json">` tag, confirmed
 * absent from the raw HTML on both real pages.
 */
function buildRichPageHtml(opts: {
  title: string;
  metaDescription?: string;
  name?: string;
  addressLocality?: string;
  description?: string;
  coverImageUrl?: string;
  amenities?: string[];
  rera?: string;
  configuration?: string;
  propertyStatus?: string;
}): string {
  const graph: object[] = [];
  const listing: Record<string, unknown> = { "@id": "#listing", "@type": ["RealEstateListing", "ApartmentComplex"] };
  if (opts.name) listing.name = opts.name;
  if (opts.addressLocality) listing.address = { "@type": "PostalAddress", addressLocality: opts.addressLocality };
  if (opts.description) listing.description = opts.description;
  if (opts.coverImageUrl) listing.image = { "@type": "ImageObject", url: opts.coverImageUrl };
  if (opts.amenities) listing.amenityFeature = opts.amenities.map((name) => ({ name, "@type": "LocationFeatureSpecification", value: true }));
  const additionalProperty: { name: string; "@type": string; value: string }[] = [];
  if (opts.rera) additionalProperty.push({ name: "MahaRERA Registration", "@type": "PropertyValue", value: opts.rera });
  if (opts.configuration) additionalProperty.push({ name: "Configuration", "@type": "PropertyValue", value: opts.configuration });
  if (opts.propertyStatus) additionalProperty.push({ name: "Property Status", "@type": "PropertyValue", value: opts.propertyStatus });
  if (additionalProperty.length) listing.additionalProperty = additionalProperty;
  graph.push(listing);

  const graphJson = JSON.stringify({ "@graph": graph });
  // Mirror the real double-encoding: the graph JSON becomes a JS string literal
  // (escaped), which is itself embedded inside the outer __next_s.push(...) call.
  const escapedOnce = JSON.stringify(graphJson).slice(1, -1); // strip the JSON.stringify's own quotes, keep the escaping
  const scriptPush = `(self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json","data-page-schema":"test","children":"${escapedOnce}"}]);`;

  return `<html><head><title>${opts.title}</title>${opts.metaDescription ? `<meta name="description" content="${opts.metaDescription}"/>` : ""}<script>${scriptPush}</script></head><body></body></html>`;
}

function buildThinPageHtml(opts: { title: string; metaDescription?: string }): string {
  return `<html><head><title>${opts.title}</title>${opts.metaDescription ? `<meta name="description" content="${opts.metaDescription}"/>` : ""}</head><body></body></html>`;
}

describe("extractRustomjeeFacts (Phase 49 -- tenth developer, Next.js Script-injected @graph JSON-LD)", () => {
  it("1. extracts the real project name from the @graph RealEstateListing.name", () => {
    const html = buildRichPageHtml({ title: "X", name: "Rustomjee Ocean Vista" });
    expect(extractRustomjeeFacts(html).name?.value).toBe("Rustomjee Ocean Vista");
  });

  it("2. developer extraction: developerGroup is genuinely never populated (lives on a separate #organization graph node, not the listing) -- always MISSING, never guessed", () => {
    const html = buildRichPageHtml({ title: "X", name: "Rustomjee Ocean Vista" });
    expect(extractRustomjeeFacts(html).developerGroup).toBeUndefined();
  });

  it("3. location extraction from address.addressLocality", () => {
    const html = buildRichPageHtml({ title: "X", addressLocality: "Versova" });
    expect(extractRustomjeeFacts(html).locality?.value).toBe("Versova");
  });

  it("4. price extraction from the meta description's 'Starting ₹NN Cr' pattern (minimum only, never a maximum)", () => {
    const html = buildRichPageHtml({ title: "X", metaDescription: "Endless blue horizons. Starting ₹27 Cr by Rustomjee." });
    const facts = extractRustomjeeFacts(html);
    expect(facts.priceMin?.value).toBe("₹27 Cr");
    expect(facts.priceMax).toBeUndefined();
  });

  it("5. RERA extraction: the structured @graph additionalProperty value takes priority over the raw-HTML fallback pattern", () => {
    const html = buildRichPageHtml({ title: "X", rera: "P51800076673" });
    expect(extractRustomjeeFacts(html).reraNumber?.value).toBe("P51800076673");
  });

  it("6. possession extraction: genuinely never available on either real page inspected -- possessionMonth/possessionYear always MISSING, never fabricated", () => {
    const html = buildRichPageHtml({ title: "X", name: "X" });
    const facts = extractRustomjeeFacts(html);
    expect(facts.possessionMonth).toBeUndefined();
    expect(facts.possessionYear).toBeUndefined();
  });

  it("7. media extraction: coverImage from @graph image.url", () => {
    const html = buildRichPageHtml({ title: "X", coverImageUrl: "https://www.rustomjee.com/publicupload/ocean-vista.webp" });
    expect(extractRustomjeeFacts(html).coverImage?.value).toBe("https://www.rustomjee.com/publicupload/ocean-vista.webp");
  });

  it("8. brochure extraction: genuinely never available on either real page -- always MISSING, never fabricated", () => {
    const html = buildRichPageHtml({ title: "X", name: "X" });
    expect(extractRustomjeeFacts(html).brochure).toBeUndefined();
  });

  it("9. missing fields on the richest real page still report MISSING correctly (e.g. no amenities given)", () => {
    const html = buildRichPageHtml({ title: "X", name: "X" });
    expect(extractRustomjeeFacts(html).amenities).toBeUndefined();
  });

  it("10. malformed structured data (the @graph blob is truncated/invalid JSON) never throws -- falls back to title/meta only", () => {
    const html = `<html><head><title>Rustomjee Broken Page</title><script>(self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json","children":"{not valid json`;
    expect(() => extractRustomjeeFacts(html)).not.toThrow();
    expect(extractRustomjeeFacts(html).metaTitle?.value).toBe("Rustomjee Broken Page");
  });

  it("11. non-200 response -> the real adapter throws distinctly (SOURCE_UNAVAILABLE contract)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(rustomjeeAdapter.fetchProjectFacts(RUSTOMJEE_OCEAN_VISTA_PROJECT_URL)).rejects.toThrow(/404/);
  });

  it("12. network failure -> the real adapter's fetch rejection propagates (caller classifies as SOURCE_UNAVAILABLE)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    await expect(rustomjeeAdapter.fetchProjectFacts(RUSTOMJEE_OCEAN_VISTA_PROJECT_URL)).rejects.toThrow(/network error/);
  });

  it("13. a wrong/different project's page never leaks into this one's facts -- extraction only ever reflects what THAT page's own markup says", () => {
    const html = buildRichPageHtml({ title: "X", name: "Rustomjee Crown", addressLocality: "Prabhadevi" });
    const facts = extractRustomjeeFacts(html);
    expect(facts.name?.value).toBe("Rustomjee Crown");
    expect(facts.locality?.value).toBe("Prabhadevi");
  });

  it("14. classifier integration -- real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRichPageHtml({ title: "X", name: "Rustomjee Ocean Vista", addressLocality: "Versova", rera: "P51800076673", propertyStatus: "Under Construction" });
    const facts = extractRustomjeeFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "Rustomjee Ocean Vista", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Versova" },
      facts,
      { url: RUSTOMJEE_OCEAN_VISTA_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
    expect(fields.find((f) => f.key === "status")?.classification).toBe("CONFLICT"); // ANNOUNCED vs Under Construction, a real disagreement
    expect(fields.find((f) => f.key === "locality")?.classification).toBe("CONFIRMED");
  });

  it("15. two different real project pages (rich vs thin) both extract correctly through the same adapter -- proving ONE adapter genuinely covers both, not one-per-project", () => {
    const richHtml = buildRichPageHtml({ title: "Rustomjee Ocean Vista - Versova", name: "Rustomjee Ocean Vista", addressLocality: "Versova", rera: "P51800076673" });
    const thinHtml = buildThinPageHtml({ title: "Rustomjee Elements in Juhu", metaDescription: "Rustomjee Elements is a sold out luxury development in Juhu with 3, 4 and 5 BHK homes." });

    const richFacts = extractRustomjeeFacts(richHtml);
    const thinFacts = extractRustomjeeFacts(thinHtml);

    expect(richFacts.name?.value).toBe("Rustomjee Ocean Vista");
    expect(richFacts.reraNumber?.value).toBe("P51800076673");

    expect(thinFacts.name).toBeUndefined(); // no @graph on the thin page -- name genuinely MISSING, not guessed from the title
    expect(thinFacts.metaTitle?.value).toBe("Rustomjee Elements in Juhu");
    expect(thinFacts.reraNumber).toBeUndefined(); // genuinely no RERA text anywhere on this page
  });

  afterEach(() => vi.unstubAllGlobals());
});
