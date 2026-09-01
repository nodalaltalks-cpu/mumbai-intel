import type { MahaRERAMatchInput, MahaRERAMatchResult, MahaRERARecord } from "./types";

/**
 * Conservative MahaRERA matching (Phase 52 Part G/H). Deliberately does NOT
 * require officialProjectName === record.registeredProjectName -- Part F is a
 * core requirement: a developer's current marketing name and MahaRERA's own
 * registered/legal name can legitimately differ (pre-launch codename, launch
 * marketing name, CTS-number-based legal description, etc.). Name similarity
 * alone is NEVER sufficient to declare a match (Part G); it is also never
 * REQUIRED to declare one, as long as stronger signals (RERA number, or
 * developer+location together) agree.
 *
 * Priority (Part G):
 *  1. An exact RERA-number match the developer's own page already published
 *     -- the single strongest signal -- is EXACT_MATCH on its own.
 *  2. Developer (promoter) identity + location together, even with a
 *     completely different project name, is STRONG_MATCH.
 *  3. More than one MahaRERA record satisfies #2 equally well -> AMBIGUOUS_MATCH
 *     (never guessed down to one).
 *  4. Developer matches but location doesn't (or vice versa) is NOT enough on
 *     its own to assert identity -- one conflicting strong signal makes a
 *     false positive too costly, so this returns NO_MATCH rather than a
 *     guessed STRONG_MATCH (Phase 52 Part Q scenarios 5/6).
 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function namesRelate(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function classifyMahaReraMatch(input: MahaRERAMatchInput, records: MahaRERARecord[]): MahaRERAMatchResult {
  // Tier 1 -- exact RERA number match (strongest possible evidence).
  if (input.officialReraNumber) {
    const exact = records.filter((r) => r.reraNumber.trim().toUpperCase() === input.officialReraNumber!.trim().toUpperCase());
    if (exact.length === 1) {
      return { classification: "EXACT_MATCH", matchedRecord: exact[0], reason: `RERA number ${input.officialReraNumber} matches exactly one MahaRERA record.` };
    }
    if (exact.length > 1) {
      return { classification: "AMBIGUOUS_MATCH", candidateRecords: exact, reason: `RERA number ${input.officialReraNumber} matches more than one MahaRERA record -- cannot select one automatically.` };
    }
    // A given RERA number that matches nothing at all is not itself an EXACT_MATCH failure signal --
    // fall through to developer+location evidence rather than asserting NO_MATCH prematurely.
  }

  const developerHits = records.filter((r) => namesRelate(r.promoterName, input.officialDeveloperName));
  const locationHits = records.filter((r) => input.officialLocalityName && r.location && namesRelate(r.location, input.officialLocalityName));

  // Tier 2 -- developer AND location both agree (names may legitimately differ -- Part F/K).
  const strongCandidates = developerHits.filter((r) => locationHits.includes(r));
  if (strongCandidates.length === 1) {
    return { classification: "STRONG_MATCH", matchedRecord: strongCandidates[0], reason: "Promoter identity and location both match this MahaRERA record; project name may legitimately differ (marketing name vs. registered name)." };
  }
  if (strongCandidates.length > 1) {
    return { classification: "AMBIGUOUS_MATCH", candidateRecords: strongCandidates, reason: "More than one MahaRERA record shares this developer and location -- insufficient evidence to select a single project." };
  }

  // Tier 3 -- only one of the two strong signals agrees. Per Part Q scenarios
  // 5/6, one conflicting strong signal must never be resolved into a guessed
  // match, however plausible a name match might look.
  if (developerHits.length > 0 || locationHits.length > 0) {
    return { classification: "NO_MATCH", reason: "Available evidence (developer or location alone, not both) does not sufficiently support a relationship to any one MahaRERA record." };
  }

  return { classification: "NO_MATCH", reason: "No MahaRERA record shares this project's developer or location." };
}
