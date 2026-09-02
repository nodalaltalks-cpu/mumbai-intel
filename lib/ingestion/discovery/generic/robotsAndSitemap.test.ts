import { describe, expect, it, vi } from "vitest";
import { parseRobotsTxt, parseSitemapXml, fetchDeveloperUrlUniverse } from "./robotsAndSitemap";

const UA = "TestBot/1.0";

function makeFetch(routes: Record<string, { status?: number; body?: string; ok?: boolean }>) {
  return vi.fn(async (url: string) => {
    const route = routes[url];
    if (!route) return { ok: false, status: 404, text: async () => "" } as Response;
    return { ok: route.ok ?? true, status: route.status ?? 200, text: async () => route.body ?? "" } as Response;
  }) as unknown as typeof fetch;
}

describe("parseRobotsTxt", () => {
  it("extracts a real Sitemap directive", () => {
    const text = "User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml";
    expect(parseRobotsTxt(text).sitemapUrls).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("detects a blanket Disallow: / for the wildcard agent", () => {
    const text = "User-agent: *\nDisallow: /";
    expect(parseRobotsTxt(text).disallowsEverythingForAllAgents).toBe(true);
  });

  it("does NOT flag a site that only disallows specific paths", () => {
    const text = "User-agent: *\nDisallow: /wp-admin/\nDisallow: /cart/";
    expect(parseRobotsTxt(text).disallowsEverythingForAllAgents).toBe(false);
  });

  it("ignores a blanket Disallow scoped to a NON-wildcard agent", () => {
    const text = "User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin/";
    expect(parseRobotsTxt(text).disallowsEverythingForAllAgents).toBe(false);
  });

  it("handles malformed/empty robots.txt without throwing", () => {
    expect(() => parseRobotsTxt("")).not.toThrow();
    expect(parseRobotsTxt("").sitemapUrls).toEqual([]);
  });
});

describe("parseSitemapXml", () => {
  it("parses a real urlset", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="x"><url><loc>https://d.com/a</loc></url><url><loc>https://d.com/b</loc></url></urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.kind).toBe("urlset");
    expect(result.urls).toEqual(["https://d.com/a", "https://d.com/b"]);
  });

  it("parses a real sitemap index", () => {
    const xml = `<?xml version="1.0"?><sitemapindex xmlns="x"><sitemap><loc>https://d.com/sitemap-1.xml</loc></sitemap><sitemap><loc>https://d.com/sitemap-2.xml</loc></sitemap></sitemapindex>`;
    const result = parseSitemapXml(xml);
    expect(result.kind).toBe("sitemapindex");
    expect(result.urls).toEqual(["https://d.com/sitemap-1.xml", "https://d.com/sitemap-2.xml"]);
  });

  it("handles malformed XML without throwing, returning an empty unknown result", () => {
    expect(() => parseSitemapXml("<not-xml-at-all")).not.toThrow();
    expect(parseSitemapXml("<not-xml-at-all")).toEqual({ kind: "unknown", urls: [] });
  });

  it("handles a genuinely empty string", () => {
    expect(parseSitemapXml("")).toEqual({ kind: "unknown", urls: [] });
  });

  it("dedupes repeated <loc> entries", () => {
    const xml = `<urlset><url><loc>https://d.com/a</loc></url><url><loc>https://d.com/a</loc></url></urlset>`;
    expect(parseSitemapXml(xml).urls).toEqual(["https://d.com/a"]);
  });
});

describe("fetchDeveloperUrlUniverse", () => {
  it("follows a robots.txt Sitemap directive to a real urlset", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": { body: `<urlset><url><loc>https://d.com/residential/a</loc></url></urlset>` },
    });
    const result = await fetchDeveloperUrlUniverse("https://d.com", fetchImpl, UA);
    expect(result.pageUrls).toEqual(["https://d.com/residential/a"]);
    expect(result.sitemapsFetched).toEqual(["https://d.com/sitemap.xml"]);
  });

  it("recurses ONE level into a real sitemap index", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap-index.xml" },
      "https://d.com/sitemap-index.xml": {
        body: `<sitemapindex><sitemap><loc>https://d.com/sitemap-1.xml</loc></sitemap></sitemapindex>`,
      },
      "https://d.com/sitemap-1.xml": { body: `<urlset><url><loc>https://d.com/residential/b</loc></url></urlset>` },
    });
    const result = await fetchDeveloperUrlUniverse("https://d.com", fetchImpl, UA);
    expect(result.pageUrls).toEqual(["https://d.com/residential/b"]);
  });

  it("falls back to /sitemap.xml when robots.txt names no Sitemap directive", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nDisallow: /admin/" },
      "https://d.com/sitemap.xml": { body: `<urlset><url><loc>https://d.com/residential/c</loc></url></urlset>` },
    });
    const result = await fetchDeveloperUrlUniverse("https://d.com", fetchImpl, UA);
    expect(result.pageUrls).toEqual(["https://d.com/residential/c"]);
  });

  it("stops immediately on a blanket Disallow: / for all agents — never fetches a sitemap", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nDisallow: /" },
      "https://d.com/sitemap.xml": { body: `<urlset><url><loc>https://d.com/x</loc></url></urlset>` },
    });
    const result = await fetchDeveloperUrlUniverse("https://d.com", fetchImpl, UA);
    expect(result.disallowsEverythingForAllAgents).toBe(true);
    expect(result.pageUrls).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // robots.txt only
  });

  it("an inaccessible domain (network error) never throws — returns an empty, honestly-reported result", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const result = await fetchDeveloperUrlUniverse("https://nowhere.invalid", fetchImpl, UA);
    expect(result.robotsFetched).toBe(false);
    expect(result.pageUrls).toEqual([]);
  });

  it("a malformed sitemap body never throws — recorded as fetched with zero URLs", async () => {
    const fetchImpl = makeFetch({
      "https://d.com/robots.txt": { body: "User-agent: *\nSitemap: https://d.com/sitemap.xml" },
      "https://d.com/sitemap.xml": { body: "not xml at all {{{" },
    });
    const result = await fetchDeveloperUrlUniverse("https://d.com", fetchImpl, UA);
    expect(result.pageUrls).toEqual([]);
    expect(result.sitemapsFetched).toEqual(["https://d.com/sitemap.xml"]);
  });
});
