import { describe, expect, it, vi } from "vitest";
import { discoverDeveloperProjects, classifyDeveloperGenericOutcome } from "./discoverDeveloperProjects";

const UA = "TestBot/1.0";

function makeFetch(routes: Record<string, { status?: number; body?: string; ok?: boolean; throws?: boolean }>) {
  return vi.fn(async (url: string) => {
    const route = routes[url];
    if (route?.throws) throw new Error("network error");
    if (!route) return { ok: false, status: 404, text: async () => "" } as Response;
    return { ok: route.ok ?? true, status: route.status ?? 200, text: async () => route.body ?? "" } as Response;
  }) as unknown as typeof fetch;
}

function apartmentComplexPage(name: string, locality: string, statusPhrase: string): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "ApartmentComplex",
    name,
    description: `A residential project. ${statusPhrase}.`,
    address: { addressLocality: locality },
  })}</script></head><body></body></html>`;
}

describe("discoverDeveloperProjects", () => {
  it("discovers multiple real projects from the SAME developer's sitemap", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": {
        body: `<urlset><url><loc>https://d.com/residential/tower-a</loc></url><url><loc>https://d.com/residential/tower-b</loc></url></urlset>`,
      },
      "https://d.com/residential/tower-a": { body: apartmentComplexPage("Tower A", "Andheri West", "under construction") },
      "https://d.com/residential/tower-b": { body: apartmentComplexPage("Tower B", "Powai", "newly launched") },
    });
    const result = await discoverDeveloperProjects("Test Developer", "https://d.com", { fetchImpl, userAgent: UA });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.projectNameGuess).sort()).toEqual(["Tower A", "Tower B"]);
    expect(result.classification).toBe("GENERIC_SUCCESS");
  });

  it("classifies a robots.txt blanket Disallow as SOURCE_UNAVAILABLE — never bypassed", async () => {
    const fetchImpl = makeFetch({ "https://d.com/robots.txt": { body: "User-agent: *\nDisallow: /" } });
    const result = await discoverDeveloperProjects("Blocked Developer", "https://d.com", { fetchImpl, userAgent: UA });
    expect(result.classification).toBe("SOURCE_UNAVAILABLE");
    expect(result.candidates).toEqual([]);
  });

  it("classifies a totally inaccessible domain as SOURCE_UNAVAILABLE without throwing", async () => {
    const fetchImpl = makeFetch({});
    const result = await discoverDeveloperProjects("Nowhere Developer", "https://nowhere.invalid", { fetchImpl, userAgent: UA });
    expect(result.classification).toBe("SOURCE_UNAVAILABLE");
  });

  it("isolates one page's fetch failure — the rest of the developer's pages still succeed", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": {
        body: `<urlset><url><loc>https://d.com/residential/ok</loc></url><url><loc>https://d.com/residential/broken</loc></url></urlset>`,
      },
      "https://d.com/residential/ok": { body: apartmentComplexPage("OK Tower", "Chembur", "under construction") },
      "https://d.com/residential/broken": { throws: true },
    });
    const result = await discoverDeveloperProjects("Partial Developer", "https://d.com", { fetchImpl, userAgent: UA });
    expect(result.pagesFailed).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].projectNameGuess).toBe("OK Tower");
  });

  it("Phase 56 regression — still resolves multiple real projects from the SAME developer when pages rely on title-derived locality evidence instead of a JSON-LD address", async () => {
    const titleOnlyPage = (name: string, locality: string) =>
      `<html><head><title>${name} — Homes in ${locality} | Test Developer</title></head><body>
        <script type="application/ld+json">${JSON.stringify({ "@type": "ApartmentComplex", name, description: "Under construction, possession soon." })}</script>
      </body></html>`;
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": {
        body: `<urlset><url><loc>https://d.com/residential/tower-a</loc></url><url><loc>https://d.com/residential/tower-b</loc></url></urlset>`,
      },
      "https://d.com/residential/tower-a": { body: titleOnlyPage("Tower A", "Andheri West") },
      "https://d.com/residential/tower-b": { body: titleOnlyPage("Tower B", "Powai") },
    });
    const result = await discoverDeveloperProjects("Test Developer", "https://d.com", { fetchImpl, userAgent: UA });
    expect(result.candidates).toHaveLength(2);
    const towerA = result.candidates.find((c) => c.projectNameGuess === "Tower A");
    expect(towerA?.areaEvidence.some((e) => e.source === "title_tag" && e.text.includes("Andheri West"))).toBe(true);
    expect(result.classification).toBe("GENERIC_SUCCESS");
  });

  it("caps the number of pages fetched (maxPagesToFetch) even when the sitemap lists more", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://d.com/residential/p${i}`);
    const routes: Record<string, { body: string }> = {
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": { body: `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>` },
    };
    for (const u of urls) routes[u] = { body: apartmentComplexPage(`Tower ${u}`, "Andheri West", "under construction") };
    const fetchImpl = makeFetch(routes);
    const result = await discoverDeveloperProjects("Big Developer", "https://d.com", { fetchImpl, userAgent: UA, maxPagesToFetch: 3 });
    expect(result.pagesFetched).toBe(3);
  });
});

describe("classifyDeveloperGenericOutcome", () => {
  it("SOURCE_UNAVAILABLE takes priority over everything else", () => {
    expect(classifyDeveloperGenericOutcome({ sourceUnavailable: true, candidateUrlsIdentified: 5, sitemapPageUrlsFound: 5, pagesFetched: 0, usableCandidates: 0, currentCandidates: 0 })).toBe(
      "SOURCE_UNAVAILABLE"
    );
  });

  it("a real sitemap with many URLs but zero URL-heuristic hits means CUSTOM_ADAPTER_REQUIRED", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 0, sitemapPageUrlsFound: 40, pagesFetched: 0, usableCandidates: 0, currentCandidates: 0 })
    ).toBe("CUSTOM_ADAPTER_REQUIRED");
  });

  it("a near-empty sitemap with zero URL-heuristic hits means NO_CURRENT_PROJECTS", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 0, sitemapPageUrlsFound: 2, pagesFetched: 0, usableCandidates: 0, currentCandidates: 0 })
    ).toBe("NO_CURRENT_PROJECTS");
  });

  it("zero usable extractions out of several fetched pages means CUSTOM_ADAPTER_REQUIRED", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 10, sitemapPageUrlsFound: 10, pagesFetched: 10, usableCandidates: 0, currentCandidates: 0 })
    ).toBe("CUSTOM_ADAPTER_REQUIRED");
  });

  it("usable extractions but none CURRENT means NO_CURRENT_PROJECTS", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 5, sitemapPageUrlsFound: 5, pagesFetched: 5, usableCandidates: 5, currentCandidates: 0 })
    ).toBe("NO_CURRENT_PROJECTS");
  });

  it("a high extraction success rate with current projects means GENERIC_SUCCESS", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 10, sitemapPageUrlsFound: 10, pagesFetched: 10, usableCandidates: 9, currentCandidates: 5 })
    ).toBe("GENERIC_SUCCESS");
  });

  it("a mediocre extraction success rate with current projects means GENERIC_PARTIAL", () => {
    expect(
      classifyDeveloperGenericOutcome({ sourceUnavailable: false, candidateUrlsIdentified: 10, sitemapPageUrlsFound: 10, pagesFetched: 10, usableCandidates: 4, currentCandidates: 2 })
    ).toBe("GENERIC_PARTIAL");
  });
});
