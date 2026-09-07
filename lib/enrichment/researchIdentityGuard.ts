/**
 * Targeted fix (Research Automation) -- two independent, pure safety checks
 * a research finding must pass BEFORE it is ever handed to
 * runResearchProviders/classifyProjectEnrichment:
 *
 *  1. Mumbai-city scope (Section 2/23) -- research is Mumbai-city residential
 *     only. A staging record whose own address/locality text clearly names
 *     an excluded area (Navi Mumbai, Thane, Mira Road, Vasai, Virar, or MMR
 *     generally) is out of scope for research entirely, unless the project
 *     itself is clearly within Mumbai city (a locality name appearing inside
 *     a Mumbai neighbourhood string, e.g. "Kalyan" the Mumbai suburb signal
 *     word never appears here on its own -- see EXCLUDED_AREA_PATTERNS).
 *
 *  2. Project identity verification (Section 12) -- before trusting a
 *     research finding's evidence, verify it actually describes THIS
 *     project, not a similarly-named one elsewhere. RERA exact match is the
 *     strongest signal; absent that, both project name AND developer name
 *     must plausibly match. A finding that carries no identity signals at
 *     all, or one that actively contradicts identity (e.g. a different RERA
 *     number, or a page-extracted developer name that doesn't match) is
 *     rejected -- never guessed past.
 *
 * Deliberately pure/synchronous, no DB or network access -- these checks run
 * entirely on the staging payload's own text and whatever identity signals
 * the research provider itself extracted from the page it read.
 */

const EXCLUDED_AREA_PATTERNS: RegExp[] = [
  /\bnavi\s*mumbai\b/i,
  /\bthane\b/i,
  /\bmira\s*[- ]?\s*bhayandar\b/i,
  /\bmira\s*road\b/i,
  /\bbhayandar\b/i,
  /\bvasai\b/i,
  /\bvirar\b/i,
  /\bkalyan\b/i,
  /\bdombivli\b/i,
  /\bpanvel\b/i,
  /\bkharghar\b/i,
  /\bulwe\b/i,
  /\bmmr\b/i,
  /\bmumbai\s*metropolitan\s*region\b/i,
];

/**
 * Conservative on purpose: only flags a CLEAR excluded-area mention. Absence
 * of a match does not itself prove Mumbai city -- callers combine this with
 * the project's already-resolved Locality (every Locality already on file is
 * Mumbai-city-scoped, per PRIMARY_CITY_SLUG usage elsewhere in this
 * codebase) as the primary signal, and only use this text scan as an extra
 * guard against a staging record whose free-text address/locality names an
 * excluded area before a real Locality has even been matched.
 */
export function mentionsExcludedArea(text: string | null | undefined): boolean {
  if (!text) return false;
  return EXCLUDED_AREA_PATTERNS.some((pattern) => pattern.test(text));
}

export interface MumbaiScopeCheck {
  inScope: boolean;
  reason: string;
}

/**
 * Section 2's project-level gate, checked ONCE per research run (not
 * per-field): a project whose own address/microMarket/locality text clearly
 * names an excluded area is entirely out of scope, regardless of how many
 * fields are missing. `resolvedLocalityName` (when the staging record
 * already has a matched Locality) is the strongest signal and, since every
 * Locality in this system is already Mumbai-city-scoped, a resolved match
 * always wins over a raw text scan.
 */
export function checkMumbaiScope(context: {
  resolvedLocalityName?: string | null;
  address?: string | null;
  microMarket?: string | null;
  rawLocalityText?: string | null;
}): MumbaiScopeCheck {
  if (context.resolvedLocalityName) {
    // Already matched against an existing (Mumbai-city-scoped) Locality row --
    // authoritative, a raw text scan on address/microMarket can't override it.
    return { inScope: true, reason: `Resolved against an existing Mumbai locality ("${context.resolvedLocalityName}").` };
  }
  const candidates = [context.address, context.microMarket, context.rawLocalityText];
  for (const text of candidates) {
    if (mentionsExcludedArea(text)) {
      return { inScope: false, reason: `Project text ("${text}") names an area outside Mumbai city -- research is Mumbai-city residential only.` };
    }
  }
  return { inScope: true, reason: "No excluded-area signal found." };
}

export interface ResearchIdentitySignals {
  /** The project name as it appeared on the page the finding came from. */
  pageProjectName?: string;
  /** The developer/builder name as it appeared on the page. */
  pageDeveloperName?: string;
  /** The RERA number as it appeared on the page, if any. */
  pageRera?: string;
}

export interface ProjectIdentityContext {
  projectName: string;
  developerName?: string | null;
  reraNumber?: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Loose containment match, not exact equality -- page titles routinely add suffixes ("Linkbay Residences | Adani Realty", "Linkbay Residences - 2 & 3 BHK Homes"). */
function looselyMatches(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na));
}

export interface IdentityVerificationResult {
  verified: boolean;
  reason: string;
}

/**
 * Section 12's per-finding gate. A finding with NO identity signals at all
 * is rejected outright -- this research layer never trusts unattributed
 * evidence, per the task's own explicit instruction ("do not merge their
 * evidence" for a similarly-named project elsewhere). RERA exact match is
 * strongest and verifies alone; otherwise BOTH project name and developer
 * name must plausibly match (Section 12's own worked example: two projects
 * both named "Aaradhya" in different cities must never be merged just
 * because the name matches).
 */
export function verifyResearchEvidenceIdentity(
  context: ProjectIdentityContext,
  signals: ResearchIdentitySignals | undefined
): IdentityVerificationResult {
  if (!signals || (!signals.pageProjectName && !signals.pageDeveloperName && !signals.pageRera)) {
    return { verified: false, reason: "No project-identity signals were extracted from the source page -- evidence cannot be trusted without them." };
  }

  if (context.reraNumber && signals.pageRera) {
    if (normalize(signals.pageRera) === normalize(context.reraNumber)) {
      return { verified: true, reason: `RERA number on the page ("${signals.pageRera}") exactly matches this project's RERA number.` };
    }
    return { verified: false, reason: `RERA number on the page ("${signals.pageRera}") does not match this project's RERA number ("${context.reraNumber}").` };
  }

  const nameMatches = signals.pageProjectName ? looselyMatches(signals.pageProjectName, context.projectName) : false;
  const developerMatches =
    context.developerName && signals.pageDeveloperName ? looselyMatches(signals.pageDeveloperName, context.developerName) : false;

  if (nameMatches && developerMatches) {
    return { verified: true, reason: `Both project name and developer name on the page match this project.` };
  }
  if (signals.pageProjectName && !nameMatches) {
    return { verified: false, reason: `Project name on the page ("${signals.pageProjectName}") does not match "${context.projectName}".` };
  }
  if (context.developerName && signals.pageDeveloperName && !developerMatches) {
    return { verified: false, reason: `Developer name on the page ("${signals.pageDeveloperName}") does not match "${context.developerName}".` };
  }
  // Name matches but no developer name was available on either side to cross-check --
  // a same-name-different-city risk (Section 12's "Aaradhya" example) that a name-only
  // match can't rule out, so this stays unverified rather than guessed past.
  if (nameMatches && !context.developerName) {
    return { verified: false, reason: `Project name matches, but no developer name is on file for this project to cross-check against -- not enough to rule out a same-named project elsewhere.` };
  }
  return { verified: false, reason: "Insufficient matching identity signals to trust this evidence belongs to this project." };
}
