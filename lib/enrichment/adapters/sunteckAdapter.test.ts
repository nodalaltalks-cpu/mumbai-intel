import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSunteckFacts, sunteckAdapter, SUNTECK_4TH_AVENUE_PROJECT_URL } from "./sunteckAdapter";
import { classifyProjectEnrichment } from "../classifyEnrichment";

/**
 * A condensed but structurally REAL replica of sunteckindia.com's actual
 * project-page markup, captured live during Phase 52 (4th Avenue, Altavia,
 * Gilbird, Kalyan Harbour): literal `application/ld+json` blocks with a
 * RealEstateListing -> mainEntity (ApartmentComplex) node, plus a plain
 * `<div class="possesionlogo">TEXT</div>` status banner and one-or-more
 * `RERA Number` badges elsewhere in the page body.
 */
function buildRealShapedHtml(opts: {
  name: string;
  description?: string;
  addressLocality?: string;
  possessionBadge?: string;
  possessionBadgeCommentedOut?: boolean;
  reraNumbers?: string[];
  amenities?: string[];
}): string {
  const listing: Record<string, unknown> = { "@context": "https://schema.org", "@type": "RealEstateListing", name: opts.name };
  if (opts.description) listing.description = opts.description;
  const mainEntity: Record<string, unknown> = { "@type": "ApartmentComplex", name: opts.name };
  if (opts.addressLocality) mainEntity.address = { "@type": "PostalAddress", addressLocality: opts.addressLocality };
  if (opts.amenities) mainEntity.amenityFeature = opts.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a }));
  listing.mainEntity = mainEntity;

  const scripts = [{ "@context": "https://schema.org", "@type": "Organization", name: "Sunteck Realty" }, listing]
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("\n");

  let badgeHtml = "";
  if (opts.possessionBadge) {
    const div = `<div class="possesionlogo">${opts.possessionBadge}\n</div>`;
    badgeHtml = opts.possessionBadgeCommentedOut ? `<!--${div}-->` : div;
  }

  const reraHtml = (opts.reraNumbers ?? [])
    .map((n) => `<div class="logo-thumb"><p> <span>RERA Number </span> <br> ${n}</p></div>`)
    .join("\n");

  return `<html><head>${scripts}</head><body>${badgeHtml}${reraHtml}</body></html>`;
}

describe("extractSunteckFacts (Phase 52 -- eleventh developer, shared literal JSON-LD template)", () => {
  it("1. extracts the real project name from mainEntity.name", () => {
    const html = buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon" });
    expect(extractSunteckFacts(html).name?.value).toBe("SunteckCity 4th Avenue Goregaon");
  });

  it("2. extracts locality from mainEntity.address.addressLocality", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Altavia", addressLocality: "Goregaon West" });
    expect(extractSunteckFacts(html).locality?.value).toBe("Goregaon West");
  });

  it("3. 'Under Construction' badge maps to an EXACT STATUS_LABEL match, high confidence, not ambiguous", () => {
    const html = buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon", possessionBadge: "Under Construction" });
    const status = extractSunteckFacts(html).status;
    expect(status?.value).toBe("Under Construction");
    expect(status?.confidence).toBe("High");
    expect(status?.ambiguous).toBeFalsy();
  });

  it("4. 'OC Received' badge maps to DELIVERED via the disclosed curated mapping, medium confidence", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Gilbird", possessionBadge: "OC Received" });
    const status = extractSunteckFacts(html).status;
    expect(status?.value).toBe("Delivered");
    expect(status?.confidence).toBe("Medium");
    expect(status?.note).toContain("Occupancy Certificate");
  });

  it("5. the REAL Sunteck Kalyan Harbour finding -- a possession badge that is HTML-COMMENTED-OUT never produces a status fact (never mistaken for a live claim)", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Kalyan Harbour", possessionBadge: "OC Received", possessionBadgeCommentedOut: true });
    expect(extractSunteckFacts(html).status).toBeUndefined();
  });

  it("6. no possession badge at all -> status genuinely MISSING, never fabricated", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Sky Park" });
    expect(extractSunteckFacts(html).status).toBeUndefined();
  });

  it("7. an unrecognized badge label is surfaced as Low-confidence/ambiguous rather than silently dropped or force-mapped", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Example", possessionBadge: "Booking Open" });
    const status = extractSunteckFacts(html).status;
    expect(status?.value).toBe("Booking Open");
    expect(status?.confidence).toBe("Low");
    expect(status?.ambiguous).toBe(true);
  });

  it("8. a single RERA number extracts cleanly and is NOT marked ambiguous", () => {
    const html = buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon", reraNumbers: ["P51800023072"] });
    const facts = extractSunteckFacts(html);
    expect(facts.reraNumber?.value).toBe("P51800023072");
    expect(facts.reraNumber?.ambiguous).toBeFalsy();
  });

  it("9. the REAL Sunteck Sky Park finding -- multiple distinct RERA numbers on one page capture the FIRST and flag ambiguous, never silently merging or dropping the rest", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Sky Park", reraNumbers: ["P51700050166", "P51700050167", "P51700055703"] });
    const facts = extractSunteckFacts(html);
    expect(facts.reraNumber?.value).toBe("P51700050166");
    expect(facts.reraNumber?.ambiguous).toBe(true);
    expect(facts.reraNumber?.note).toContain("3 distinct RERA numbers");
  });

  it("10. no RERA badge at all -> reraNumber genuinely MISSING, never fabricated (the real Sunteck Altavia finding)", () => {
    const html = buildRealShapedHtml({ name: "Sunteck Altavia", addressLocality: "Goregaon West" });
    expect(extractSunteckFacts(html).reraNumber).toBeUndefined();
  });

  it("11. extracts amenities as a real named list, not just a count", () => {
    const html = buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon", amenities: ["Infinity Pool", "Township Lifestyle"] });
    const facts = extractSunteckFacts(html);
    expect(facts.amenities?.value).toBe("2 selected");
    expect(facts.amenities?.items).toEqual(["Infinity Pool", "Township Lifestyle"]);
  });

  it("12. a malformed JSON-LD block is skipped without throwing away the rest of the page's real data", () => {
    const html = `<script type="application/ld+json">{not valid json</script>` + buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon", addressLocality: "Goregaon West" });
    expect(() => extractSunteckFacts(html)).not.toThrow();
    expect(extractSunteckFacts(html).locality?.value).toBe("Goregaon West");
  });

  it("13. real end-to-end classification through the SAME classifyProjectEnrichment used by every other adapter", () => {
    const html = buildRealShapedHtml({ name: "SunteckCity 4th Avenue Goregaon", addressLocality: "Goregaon West", possessionBadge: "Under Construction", reraNumbers: ["P51800023072"] });
    const facts = extractSunteckFacts(html);
    const fields = classifyProjectEnrichment(
      { name: "SunteckCity 4th Avenue Goregaon", status: "ANNOUNCED", category: "RESIDENTIAL", localityId: "loc-1", dataSource: "EXTERNAL_OPEN_DATA" } as never,
      { localityName: "Goregaon West" },
      facts,
      { url: SUNTECK_4TH_AVENUE_PROJECT_URL, tier: "OFFICIAL_DEVELOPER" }
    );
    expect(fields.find((f) => f.key === "reraNumber")?.classification).toBe("GREEN_NEW");
    expect(fields.find((f) => f.key === "locality")?.classification).toBe("CONFIRMED");
    expect(fields.find((f) => f.key === "status")?.classification).toBe("CONFLICT");
  });

  it("14. the real adapter throws distinctly on a non-OK fetch (SOURCE_UNAVAILABLE contract)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(sunteckAdapter.fetchProjectFacts(SUNTECK_4TH_AVENUE_PROJECT_URL)).rejects.toThrow(/503/);
  });

  it("15. a wrong/unrelated project URL still only returns whatever THAT page's own JSON-LD says -- the adapter never assumes a name", () => {
    const html = buildRealShapedHtml({ name: "Sunteck WestWorld", addressLocality: "Naigaon East" });
    const facts = extractSunteckFacts(html);
    expect(facts.name?.value).toBe("Sunteck WestWorld");
    expect(facts.name?.value).not.toBe("SunteckCity 4th Avenue Goregaon");
  });

  afterEach(() => vi.unstubAllGlobals());
});
