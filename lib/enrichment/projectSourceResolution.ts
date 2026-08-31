import "server-only";
import type { OfficialSourceAdapter } from "./types";

/**
 * Phase 43 Part B/C — replaces the Phase 29-42 assumption that a developer
 * domain maps to exactly ONE project ({projectUrl, adapter}). Confirmed by
 * actually re-running the EXISTING Adani and Gurukrupa Realcon adapters
 * against a second real project page each (Western Heights; Maurya and
 * Dhyanam) during this phase: every adapter's extraction logic already
 * generalizes across a developer's projects (it was only ever parametrized
 * by the fetched URL, never hardcoded to one project's name/id) -- the
 * bottleneck was purely CURATED_SOURCES's shape, not the adapters.
 *
 * One adapter is still shared per developer (same CMS/template across that
 * developer's own site), but `projects` now holds MANY curated
 * normalized-project-name -> URL entries. Adding a project means adding one
 * verified row here -- the same discipline developerDomainRegistry.ts
 * already uses, never a guessed URL.
 */
export interface DeveloperSource {
  adapter: OfficialSourceAdapter;
  /** normalized project name -> hand-verified project URL. */
  projects: Record<string, string>;
  /** The developer's own real sitemap URL (verified reachable, Phase 43) -- used ONLY as a last-resort discovery tier (Part C tier 3), never assumed to exist. */
  sitemapUrl?: string;
}

export type ProjectSourceStatus = "IDENTIFIED" | "AMBIGUOUS" | "NO_SOURCE";

export interface ProjectSourceResult {
  status: ProjectSourceStatus;
  projectUrl?: string;
  /** Which resolution tier produced this result (Part C) -- surfaced for founder transparency, never hidden. */
  tier?: "CURATED" | "DISCOVERY_SOURCE" | "SITEMAP_EXACT";
  /** Only set for AMBIGUOUS -- every candidate URL that matched, so a human can pick rather than the system guessing. */
  candidateUrls?: string[];
}

/** Same normalization discipline as developerDomainRegistry.ts's own `normalize()` -- case/whitespace-insensitive, nothing fuzzier. */
function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Letters/digits only, no spaces -- for comparing a project name against a URL slug, which never contains the exact display-name spacing/punctuation. */
function compactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUrlOnDomain(url: string, domain: string): boolean {
  try {
    return new URL(url).origin === new URL(domain).origin;
  } catch {
    return false;
  }
}

/**
 * Part C tiers 1-2, and Part D's core safety rule: NEVER return a URL for
 * any project other than the one actually being asked about. Tier 1 (the
 * curated map) is an exact normalized-name lookup -- if "gurukrupa maurya"
 * isn't a key, this never falls back to whatever OTHER project happens to be
 * curated for that developer. Tier 2 only trusts a `knownSourceUrl` when it
 * is verifiably on the resolved developer's own domain (the discovery
 * pipeline already verified it points to a real official page for exactly
 * this project during Phase 39-41 -- this tier exists so a newly-discovered
 * project doesn't need a human to hand-curate it before it can be enriched).
 */
export function resolveCuratedProjectSource(
  source: DeveloperSource,
  developerDomain: string,
  projectName: string,
  knownSourceUrl?: string | null
): ProjectSourceResult {
  const curated = source.projects[normalizeProjectName(projectName)];
  if (curated) return { status: "IDENTIFIED", projectUrl: curated, tier: "CURATED" };

  if (knownSourceUrl && isUrlOnDomain(knownSourceUrl, developerDomain)) {
    return { status: "IDENTIFIED", projectUrl: knownSourceUrl, tier: "DISCOVERY_SOURCE" };
  }

  return { status: "NO_SOURCE" };
}

/**
 * Part C tiers 3-4 (live, last resort): fetches the developer's own real
 * sitemap and looks for a URL whose LAST path segment strongly matches the
 * project name once both are reduced to letters/digits only ("Gurukrupa
 * Maurya" -> "gurukrupamaurya", matching a `/projects/gurukrupa-maurya`
 * slug's "gurukrupamaurya" exactly). Deliberately strict -- a loose/partial
 * match here is exactly the "wrong project" risk Part D forbids, so this
 * only ever accepts an EXACT compact-name match, never a fuzzy one.
 * Multiple equally-exact matches (a real possibility if a developer lists
 * both a project and, say, its `/gallery` sub-page in the sitemap) return
 * AMBIGUOUS rather than picking the first one.
 */
export async function resolveProjectUrlFromSitemap(
  sitemapUrl: string,
  projectName: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProjectSourceResult> {
  let sitemapText: string;
  try {
    const response = await fetchImpl(sitemapUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)" } });
    if (!response.ok) return { status: "NO_SOURCE" };
    sitemapText = await response.text();
  } catch {
    return { status: "NO_SOURCE" };
  }

  const locs = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
  const targetCompact = compactName(projectName);
  const matches: string[] = [];
  for (const loc of locs) {
    const slug = loc.replace(/\/$/, "").split("/").pop() ?? "";
    if (compactName(slug) === targetCompact) matches.push(loc);
  }

  if (matches.length === 0) return { status: "NO_SOURCE" };
  if (matches.length > 1) return { status: "AMBIGUOUS", candidateUrls: matches };
  return { status: "IDENTIFIED", projectUrl: matches[0], tier: "SITEMAP_EXACT" };
}

/**
 * The full Part C pipeline: curated map -> known discovery source URL ->
 * live sitemap discovery -> NO_SOURCE. Tries the free (no-network) tiers
 * first; only reaches the network tier when genuinely necessary.
 */
export async function resolveProjectSource(
  source: DeveloperSource,
  developerDomain: string,
  projectName: string,
  knownSourceUrl?: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<ProjectSourceResult> {
  const curated = resolveCuratedProjectSource(source, developerDomain, projectName, knownSourceUrl);
  if (curated.status === "IDENTIFIED") return curated;

  if (source.sitemapUrl) {
    return resolveProjectUrlFromSitemap(source.sitemapUrl, projectName, fetchImpl);
  }

  return { status: "NO_SOURCE" };
}
