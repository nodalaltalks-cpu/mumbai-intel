/**
 * Curated developer → official-domain mapping (Phase 28 Part E).
 *
 * Deliberately a static, hand-verified list -- NOT automated web-wide domain
 * discovery. A developer's official domain must never be guessed from a
 * search result or a name-similarity match (the exact mistake Phase 15/16
 * flagged: several lookalike "-launch"/"-versova" domains were found
 * squatting on the Godrej Skyshore project name). Every entry here was
 * verified by hand (see Phase 16's cross-checked evidence: consistent
 * corporate branding, cross-linked blog on the same domain).
 *
 * Adding a developer means adding one verified row here -- never a fallback
 * to an unverified guess.
 */
const CURATED_DEVELOPER_DOMAINS: Record<string, string> = {
  "godrej properties ltd.": "https://www.godrejproperties.com",
  "godrej properties limited": "https://www.godrejproperties.com",
  "godrej properties": "https://www.godrejproperties.com",
  // Phase 31 -- second-developer generalization proof. The staged value
  // carries a joint-venture partner suffix ("& RC Group") that the developer's
  // own official site never mentions (see adaniRealtyAdapter.ts); both the
  // exact staged string and the bare company name are curated here since
  // Adani Realty is clearly the primary/official party for this project.
  "adani realty & rc group": "https://www.adanirealty.com",
  "adani realty": "https://www.adanirealty.com",
  // Phase 38 -- third-developer generalization proof (confirmed via
  // www.kalpataru.com's own JSON-LD Organization.name: "Kalpataru Limited").
  "kalpataru limited": "https://www.kalpataru.com",
  "kalpataru": "https://www.kalpataru.com",
  // Phase 40 -- fourth developer, the first discovered via Phase 39's
  // area-discovery pipeline rather than picked by hand. Confirmed via
  // gurukruparealcon.com's own homepage JSON-LD (Organization.name
  // "Gurukrupa Realcon", matching LinkedIn/Instagram/YouTube/Facebook), a
  // clean robots.txt, and a real sitemap listing 25 real projects including
  // gurukrupa-ekam -- NOT gurukrupagroup.com (Phase 38's guess, which turned
  // out to be a real but unrelated Gurukrupa-branded site with no matching
  // project), and NOT thegurukruparealcon.com (a thinner lookalike with no
  // JSON-LD, no matching phone number, and a 404 robots.txt).
  "gurukrupa realcon": "https://gurukruparealcon.com",
  // Phase 41 -- bulk Andheri West discovery. Each confirmed the same way:
  // real Organization JSON-LD matching the developer's own social profiles,
  // a clean robots.txt, and a real sitemap listing the actual discovered
  // project -- never a project-name-based microsite (e.g. Puravankara's own
  // domain was distinguished from puravankaraestrella.in/estrellapurva.com,
  // both real but unofficial lead-gen sites for the same project).
  "puravankara limited": "https://www.puravankara.com",
  "puravankara": "https://www.puravankara.com",
  "platinum corp": "https://www.platinumcorp.in",
  "lodha": "https://www.lodhagroup.com",
  "macrotech developers": "https://www.lodhagroup.com",
  // Phase 47 -- 25-Andheri-West-project bulk test, seventh developer.
  // Confirmed via oberoirealty.com's own Organization JSON-LD (name "Oberoi
  // Realty", matching real facebook/instagram/youtube/linkedin profiles), a
  // clean robots.txt, and a real Screaming-Frog-generated sitemap listing
  // genuine Andheri West project pages -- NOT a lead-gen microsite.
  "oberoi realty": "https://www.oberoirealty.com",
  // Phase 47 -- eighth developer. Confirmed via koltepatil.com's own robots.txt
  // (explicitly Allow: / for GPTBot/ClaudeBot/anthropic-ai), a real sitemap,
  // and structured JSON-LD on the actual Serenova project page.
  "kolte patil developers ltd.": "https://www.koltepatil.com",
  "kolte patil": "https://www.koltepatil.com",
  // Phase 48 -- ninth developer, part of the Mumbai-wide coverage audit.
  // Confirmed via runwalrealty.com's own Organization JSON-LD (name "Runwal
  // Realty", foundingDate 1978, matching real facebook/instagram/linkedin/
  // youtube profiles), a clean robots.txt, and a real sitemap with dedicated
  // residential-ongoing/upcoming/complete sub-sitemaps.
  "runwal realty": "https://runwalrealty.com",
  "runwal": "https://runwalrealty.com",
  // Phase 49 -- tenth developer, the primary scaling test (biggest single
  // Mumbai footprint verified so far: 57 real top-level residential project
  // pages on its own sitemap-projects.xml). Confirmed via a clean robots.txt
  // (only /wp-admin/ disallowed, real Sitemap directive), real per-project
  // content matching the developer's own known brand across dozens of
  // pages, and a real @graph JSON-LD naming the developer directly.
  "rustomjee": "https://www.rustomjee.com",
  "keystone realtors": "https://www.rustomjee.com",
  // Phase 52 -- eleventh developer, the focused full-treatment target.
  // Confirmed via sunteckindia.com's own Organization JSON-LD (name "Sunteck
  // Realty", phone +91-22-6198-9898 matching real linkedin/instagram/facebook
  // profiles), a robots.txt that only disallows career/investor/disclaimer
  // pages (every residential project page is explicitly crawlable) with a
  // real Sitemap directive, and a real sitemap.xml listing the developer's
  // own current project pages -- also confirmed to be the correct listed
  // company (BSE 512179 / NSE SUNTECK), not the unrelated same-named IT firm
  // the founder flagged during this phase's research.
  "sunteck realty": "https://www.sunteckindia.com",
  "sunteck": "https://www.sunteckindia.com",
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns the verified official domain for a developer, or null if it isn't in the curated list yet -- never a guess. */
export function resolveDeveloperDomain(developerGroup: string | undefined | null): string | null {
  if (!developerGroup) return null;
  return CURATED_DEVELOPER_DOMAINS[normalize(developerGroup)] ?? null;
}
