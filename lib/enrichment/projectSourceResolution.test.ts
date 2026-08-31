import { describe, expect, it, vi } from "vitest";
import { resolveCuratedProjectSource, resolveProjectSource, resolveProjectUrlFromSitemap, type DeveloperSource } from "./projectSourceResolution";
import type { OfficialSourceAdapter } from "./types";

const FAKE_ADAPTER: OfficialSourceAdapter = {
  tier: "OFFICIAL_DEVELOPER",
  resolveDomain: () => null,
  fetchProjectFacts: async () => ({}),
};

const ADANI_DOMAIN = "https://www.adanirealty.com";
const ADANI_SOURCE: DeveloperSource = {
  adapter: FAKE_ADAPTER,
  projects: {
    "linkbay residences": "https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences",
    "western heights": "https://www.adanirealty.com/residential-projects/mumbai/western-heights",
  },
  sitemapUrl: "https://www.adanirealty.com/sitemap.xml",
};

describe("resolveCuratedProjectSource (Phase 43 Part C tiers 1-2, Part D safety)", () => {
  it("1. one developer / one project -- resolves the single curated project correctly", () => {
    const source: DeveloperSource = { adapter: FAKE_ADAPTER, projects: { "kalpataru vian": "https://www.kalpataru.com/mumbai/kalpataru-vian" } };
    const result = resolveCuratedProjectSource(source, "https://www.kalpataru.com", "Kalpataru Vian");
    expect(result).toEqual({ status: "IDENTIFIED", projectUrl: "https://www.kalpataru.com/mumbai/kalpataru-vian", tier: "CURATED" });
  });

  it("2. one developer / multiple projects -- resolves EACH project to its OWN curated URL, never the other one", () => {
    const linkbay = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Linkbay Residences");
    const western = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Western Heights");
    expect(linkbay.projectUrl).toContain("linkbay-residences");
    expect(western.projectUrl).toContain("western-heights");
    expect(linkbay.projectUrl).not.toBe(western.projectUrl);
  });

  it("3. exact project URL match is case/whitespace-insensitive, same discipline as developerDomainRegistry.ts", () => {
    const result = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "  Western   HEIGHTS  ");
    expect(result.status).toBe("IDENTIFIED");
    expect(result.projectUrl).toContain("western-heights");
  });

  it("7. wrong-project prevention -- a project name not in the curated map NEVER falls back to another curated project's URL", () => {
    const result = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Some New Adani Project Not Yet Curated");
    expect(result.status).toBe("NO_SOURCE");
    expect(result.projectUrl).toBeUndefined();
  });

  it("tier 2 -- trusts a discovery-verified sourceUrl ONLY when it is on the resolved developer's own domain", () => {
    const onDomain = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Brand New Project", "https://www.adanirealty.com/residential-projects/mumbai/brand-new-project");
    expect(onDomain).toEqual({ status: "IDENTIFIED", projectUrl: "https://www.adanirealty.com/residential-projects/mumbai/brand-new-project", tier: "DISCOVERY_SOURCE" });

    const offDomain = resolveCuratedProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Brand New Project", "https://example-portal.test/brand-new-project");
    expect(offDomain.status).toBe("NO_SOURCE"); // never trusts a URL on a DIFFERENT domain, even if "discovered"
  });
});

describe("resolveProjectUrlFromSitemap (Phase 43 Part C tiers 3-4, live sitemap discovery)", () => {
  const SITEMAP_XML = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences</loc></url>
    <url><loc>https://www.adanirealty.com/residential-projects/mumbai/western-heights</loc></url>
    <url><loc>https://www.adanirealty.com/residential-projects/mumbai/western-heights-phase-2</loc></url>
    <url><loc>https://www.adanirealty.com/blogs/andheri-real-estate-hotspot</loc></url>
  </urlset>`;

  function mockFetch(text: string, ok = true) {
    return vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, text: async () => text });
  }

  it("4. sitemap project URL match -- finds the real URL via an exact compact-name slug match", async () => {
    const fetchMock = mockFetch(SITEMAP_XML);
    const result = await resolveProjectUrlFromSitemap("https://www.adanirealty.com/sitemap.xml", "Linkbay Residences", fetchMock);
    expect(result).toEqual({ status: "IDENTIFIED", projectUrl: "https://www.adanirealty.com/residential-projects/mumbai/linkbay-residences", tier: "SITEMAP_EXACT" });
  });

  it("5. no URL found -- a project genuinely absent from the sitemap reports NO_SOURCE, never a guess", async () => {
    const fetchMock = mockFetch(SITEMAP_XML);
    const result = await resolveProjectUrlFromSitemap("https://www.adanirealty.com/sitemap.xml", "Some Totally Different Project", fetchMock);
    expect(result.status).toBe("NO_SOURCE");
  });

  it("6. ambiguous URL -- 'Western Heights' also compact-matches nothing extra here, but a genuinely duplicated slug returns AMBIGUOUS rather than picking one", async () => {
    const dupSitemap = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.adanirealty.com/residential-projects/mumbai/gardenia</loc></url>
      <url><loc>https://www.adanirealty.com/residential-projects/pune/gardenia</loc></url>
    </urlset>`;
    const fetchMock = mockFetch(dupSitemap);
    const result = await resolveProjectUrlFromSitemap("https://www.adanirealty.com/sitemap.xml", "Gardenia", fetchMock);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.candidateUrls).toHaveLength(2);
  });

  it("never fabricates a match when the sitemap fetch itself fails", async () => {
    const fetchMock = mockFetch("", false);
    const result = await resolveProjectUrlFromSitemap("https://www.adanirealty.com/sitemap.xml", "Linkbay Residences", fetchMock);
    expect(result.status).toBe("NO_SOURCE");
  });

  it("never throws when the fetch itself rejects (network failure)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await resolveProjectUrlFromSitemap("https://www.adanirealty.com/sitemap.xml", "Linkbay Residences", fetchMock);
    expect(result.status).toBe("NO_SOURCE");
  });
});

describe("resolveProjectSource (Phase 43 — the full pipeline)", () => {
  it("tries the curated map first, never hitting the network when it already has an answer", async () => {
    const fetchMock = vi.fn();
    const result = await resolveProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "Western Heights", null, fetchMock);
    expect(result.tier).toBe("CURATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls through to live sitemap discovery only when nothing curated/known matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => `<urlset><url><loc>https://www.adanirealty.com/residential-projects/mumbai/newproj</loc></url></urlset>` });
    const result = await resolveProjectSource(ADANI_SOURCE, ADANI_DOMAIN, "NewProj", null, fetchMock);
    expect(result.status).toBe("IDENTIFIED");
    expect(result.tier).toBe("SITEMAP_EXACT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns NO_SOURCE when a developer has no sitemapUrl configured and nothing else matches", async () => {
    const noSitemapSource: DeveloperSource = { adapter: FAKE_ADAPTER, projects: {} };
    const fetchMock = vi.fn();
    const result = await resolveProjectSource(noSitemapSource, ADANI_DOMAIN, "Anything", null, fetchMock);
    expect(result.status).toBe("NO_SOURCE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
