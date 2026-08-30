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
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns the verified official domain for a developer, or null if it isn't in the curated list yet -- never a guess. */
export function resolveDeveloperDomain(developerGroup: string | undefined | null): string | null {
  if (!developerGroup) return null;
  return CURATED_DEVELOPER_DOMAINS[normalize(developerGroup)] ?? null;
}
