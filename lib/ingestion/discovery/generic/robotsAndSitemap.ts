/**
 * Phase 55 Part B — small, reused robots.txt + sitemap.xml reader for the
 * generic discovery engine. Deliberately hand-rolled regex parsing (no new
 * XML dependency), matching every existing adapter's own JSON-LD-via-regex
 * discipline in this codebase rather than introducing a new parsing library.
 *
 * Pure parsing functions are separated from the one I/O function
 * (`fetchDeveloperUrlUniverse`) so every parsing edge case (malformed XML, a
 * sitemap index, a blanket Disallow) is unit-testable without a network call.
 */

const MAX_SITEMAPS_FETCHED = 15;
const MAX_SITEMAP_RECURSION_DEPTH = 2;

export interface ParsedRobots {
  /** Every `Sitemap:` directive found, in file order. */
  sitemapUrls: string[];
  /** True only when `User-agent: *` is followed by a bare `Disallow: /` before the next `User-agent:` block — a genuine site-wide block, not a handful of disallowed paths. */
  disallowsEverythingForAllAgents: boolean;
}

/** Pure. Parses a robots.txt body into its Sitemap directives and whether it blanket-disallows every crawler. */
export function parseRobotsTxt(text: string): ParsedRobots {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sitemapUrls: string[] = [];
  for (const line of lines) {
    const m = line.match(/^Sitemap:\s*(\S+)/i);
    if (m) sitemapUrls.push(m[1]);
  }

  let disallowsEverythingForAllAgents = false;
  let inWildcardBlock = false;
  for (const line of lines) {
    const uaMatch = line.match(/^User-agent:\s*(\S+)/i);
    if (uaMatch) {
      inWildcardBlock = uaMatch[1] === "*";
      continue;
    }
    if (!inWildcardBlock) continue;
    const disallowMatch = line.match(/^Disallow:\s*(\S*)/i);
    if (disallowMatch && disallowMatch[1] === "/") {
      disallowsEverythingForAllAgents = true;
    }
  }

  return { sitemapUrls: [...new Set(sitemapUrls)], disallowsEverythingForAllAgents };
}

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | "unknown";
  /** For a urlset: the page URLs. For a sitemapindex: the child sitemap URLs. */
  urls: string[];
}

/** Pure. Extracts every `<loc>` URL and tells apart a urlset from a sitemapindex. Malformed/empty XML returns `{ kind: "unknown", urls: [] }` rather than throwing. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  if (!xml || typeof xml !== "string") return { kind: "unknown", urls: [] };
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (locs.length === 0) return { kind: "unknown", urls: [] };
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "sitemapindex" : /<urlset[\s>]/i.test(xml) ? "urlset" : "unknown";
  return { kind, urls: [...new Set(locs)] };
}

export interface DeveloperUrlUniverseResult {
  robotsFetched: boolean;
  disallowsEverythingForAllAgents: boolean;
  sitemapsFetched: string[];
  sitemapsFailed: string[];
  /** Every page URL found across every urlset sitemap (deduped), NOT yet filtered for "looks like a project page". */
  pageUrls: string[];
}

/**
 * I/O: fetches `${domain}/robots.txt`, resolves its Sitemap directives (or
 * falls back to `${domain}/sitemap.xml` when robots.txt names none), and
 * recurses into any sitemap index up to MAX_SITEMAP_RECURSION_DEPTH levels,
 * bounded by MAX_SITEMAPS_FETCHED total sitemap fetches (Part L: controlled,
 * conservative crawling — never an unbounded recursive fetch of an
 * adversarially large sitemap index). Never throws: a failed fetch at any
 * step is recorded, not raised, so one bad developer never aborts a batch
 * (Part P "failure isolation").
 */
export async function fetchDeveloperUrlUniverse(
  domain: string,
  fetchImpl: typeof fetch,
  userAgent: string
): Promise<DeveloperUrlUniverseResult> {
  const result: DeveloperUrlUniverseResult = {
    robotsFetched: false,
    disallowsEverythingForAllAgents: false,
    sitemapsFetched: [],
    sitemapsFailed: [],
    pageUrls: [],
  };

  let sitemapCandidates: string[] = [];
  try {
    const robotsRes = await fetchImpl(`${domain.replace(/\/$/, "")}/robots.txt`, { headers: { "User-Agent": userAgent } });
    if (robotsRes.ok) {
      result.robotsFetched = true;
      const parsed = parseRobotsTxt(await robotsRes.text());
      result.disallowsEverythingForAllAgents = parsed.disallowsEverythingForAllAgents;
      sitemapCandidates = parsed.sitemapUrls;
    }
  } catch {
    // Honestly recorded via robotsFetched staying false — never thrown.
  }

  if (result.disallowsEverythingForAllAgents) return result;
  if (sitemapCandidates.length === 0) sitemapCandidates = [`${domain.replace(/\/$/, "")}/sitemap.xml`];

  const seenSitemaps = new Set<string>();
  const pageUrls = new Set<string>();
  let queue = sitemapCandidates.slice(0, MAX_SITEMAPS_FETCHED);
  let depth = 0;

  while (queue.length > 0 && depth <= MAX_SITEMAP_RECURSION_DEPTH && result.sitemapsFetched.length < MAX_SITEMAPS_FETCHED) {
    const nextQueue: string[] = [];
    for (const sitemapUrl of queue) {
      if (seenSitemaps.has(sitemapUrl) || result.sitemapsFetched.length >= MAX_SITEMAPS_FETCHED) continue;
      seenSitemaps.add(sitemapUrl);
      try {
        const res = await fetchImpl(sitemapUrl, { headers: { "User-Agent": userAgent } });
        if (!res.ok) {
          result.sitemapsFailed.push(sitemapUrl);
          continue;
        }
        const parsed = parseSitemapXml(await res.text());
        result.sitemapsFetched.push(sitemapUrl);
        if (parsed.kind === "sitemapindex") {
          for (const child of parsed.urls) nextQueue.push(child);
        } else {
          for (const u of parsed.urls) pageUrls.add(u);
        }
      } catch {
        result.sitemapsFailed.push(sitemapUrl);
      }
    }
    queue = nextQueue;
    depth += 1;
  }

  result.pageUrls = [...pageUrls];
  return result;
}
