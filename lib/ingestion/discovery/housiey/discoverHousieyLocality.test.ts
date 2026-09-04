import { describe, expect, it, vi } from "vitest";
import { extractHousieyProjectLinks, discoverHousieyLocalityProjects, HOUSIEY_BASE_URL } from "./discoverHousieyLocality";

describe("extractHousieyProjectLinks (Phase 67 — URL normalization)", () => {
  it("extracts real /projects/<slug> links and absolute-izes them", () => {
    const html = `<a href="/projects/godrej-avenue-eleven">Godrej Avenue Eleven</a><a href="/projects/piramal-mahalaxmi">Piramal Mahalaxmi</a>`;
    expect(extractHousieyProjectLinks(html)).toEqual([
      `${HOUSIEY_BASE_URL}/projects/godrej-avenue-eleven`,
      `${HOUSIEY_BASE_URL}/projects/piramal-mahalaxmi`,
    ]);
  });

  it("dedupes the same link appearing multiple times on the page", () => {
    const html = `<a href="/projects/lodha-bellevue">X</a><a href="/projects/lodha-bellevue">X again</a>`;
    expect(extractHousieyProjectLinks(html)).toEqual([`${HOUSIEY_BASE_URL}/projects/lodha-bellevue`]);
  });

  it("never matches the robots-disallowed singular /project/ path", () => {
    const html = `<a href="/project/some-slug">Disallowed</a><a href="/projects/real-slug">Allowed</a>`;
    expect(extractHousieyProjectLinks(html)).toEqual([`${HOUSIEY_BASE_URL}/projects/real-slug`]);
  });

  it("never matches unrelated paths (tag pages, locality pages, root)", () => {
    const html = `<a href="/tag/some-tag">Tag</a><a href="/in/mumbai/worli">Locality</a><a href="/">Home</a>`;
    expect(extractHousieyProjectLinks(html)).toEqual([]);
  });

  it("returns an empty array for a page with no project links", () => {
    expect(extractHousieyProjectLinks("<html><body>nothing here</body></html>")).toEqual([]);
  });
});

describe("discoverHousieyLocalityProjects (Phase 67 — orchestration, reuses the existing generic extractor)", () => {
  function fetchImplFor(responses: Record<string, { ok: boolean; status?: number; text: string }>): typeof fetch {
    return vi.fn(async (url: string | URL) => {
      const key = String(url);
      const r = responses[key];
      if (!r) throw new Error(`Unexpected fetch: ${key}`);
      return { ok: r.ok, status: r.status ?? 200, text: async () => r.text } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("1. locality page fetch failure -> localityPageFetched false, no project pages fetched", async () => {
    const fetchImpl = fetchImplFor({
      [`${HOUSIEY_BASE_URL}/in/mumbai/worli`]: { ok: false, status: 404, text: "" },
    });
    const result = await discoverHousieyLocalityProjects("worli", { fetchImpl });
    expect(result.localityPageFetched).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(result.pagesFetched).toBe(0);
  });

  it("2. real locality page -> extracts project links and fetches each, reusing the existing generic extractor for facts", async () => {
    const localityHtml = `<a href="/projects/real-project-one">One</a><a href="/projects/real-project-two">Two</a>`;
    const projectOneHtml = `<title>Real Project One | Worli</title><script type="application/ld+json">${JSON.stringify({
      "@type": "Residence",
      name: "Real Project One",
    })}</script>`;
    const projectTwoHtml = `<title>Real Project Two | Worli</title>`;
    const fetchImpl = fetchImplFor({
      [`${HOUSIEY_BASE_URL}/in/mumbai/worli`]: { ok: true, text: localityHtml },
      [`${HOUSIEY_BASE_URL}/projects/real-project-one`]: { ok: true, text: projectOneHtml },
      [`${HOUSIEY_BASE_URL}/projects/real-project-two`]: { ok: true, text: projectTwoHtml },
    });
    const result = await discoverHousieyLocalityProjects("worli", { fetchImpl });
    expect(result.localityPageFetched).toBe(true);
    expect(result.projectLinksFound).toBe(2);
    expect(result.pagesFetched).toBe(2);
    expect(result.pagesFailed).toBe(0);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.url)).toEqual([
      `${HOUSIEY_BASE_URL}/projects/real-project-one`,
      `${HOUSIEY_BASE_URL}/projects/real-project-two`,
    ]);
  });

  it("3. a failed individual project-page fetch is counted as pagesFailed, never thrown -- failure isolation matches discoverDeveloperProjects", async () => {
    const localityHtml = `<a href="/projects/ok-project">OK</a><a href="/projects/broken-project">Broken</a>`;
    const fetchImpl = fetchImplFor({
      [`${HOUSIEY_BASE_URL}/in/mumbai/worli`]: { ok: true, text: localityHtml },
      [`${HOUSIEY_BASE_URL}/projects/ok-project`]: { ok: true, text: "<title>OK Project</title>" },
      [`${HOUSIEY_BASE_URL}/projects/broken-project`]: { ok: false, status: 500, text: "" },
    });
    const result = await discoverHousieyLocalityProjects("worli", { fetchImpl });
    expect(result.pagesFetched).toBe(2);
    expect(result.pagesFailed).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });

  it("4. respects maxProjectPages -- never fetches more than the configured bounded sample", async () => {
    const links = Array.from({ length: 30 }, (_, i) => `/projects/project-${i}`);
    const localityHtml = links.map((l) => `<a href="${l}">P</a>`).join("");
    const responses: Record<string, { ok: boolean; text: string }> = {
      [`${HOUSIEY_BASE_URL}/in/mumbai/worli`]: { ok: true, text: localityHtml },
    };
    for (const l of links) responses[`${HOUSIEY_BASE_URL}${l}`] = { ok: true, text: "<title>Project</title>" };
    const result = await discoverHousieyLocalityProjects("worli", { fetchImpl: fetchImplFor(responses), maxProjectPages: 5 });
    expect(result.projectLinksFound).toBe(30);
    expect(result.pagesFetched).toBe(5);
  });

  it("5. a fetch throwing (network error) on the locality page never propagates -- degrades to localityPageFetched: false", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await discoverHousieyLocalityProjects("worli", { fetchImpl });
    expect(result.localityPageFetched).toBe(false);
    expect(result.candidates).toEqual([]);
  });
});
