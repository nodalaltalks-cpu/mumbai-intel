/**
 * Phase 63 — the Mumbai-city discovery pipeline only ever loads Localities
 * scoped to Mumbai city (see stageMumbaiDiscoveryCandidates.ts), so any MMR
 * project's area text was already safely EXCLUDED before this phase — it
 * could never resolve to a Mumbai Locality and so never got mis-staged. The
 * gap this file closes is purely a LABELING one: that exclusion previously
 * looked identical to "genuinely unparseable" (EXCLUDED_LOCATION_UNRESOLVED),
 * with no way to tell "this is a real Thane project" apart from "this page's
 * address text just didn't parse." Nothing about the actual exclusion
 * behavior changes — a candidate whose evidence matches one of these
 * keywords was already being excluded; it now says why.
 *
 * Deliberately NOT exhaustive (the phase brief explicitly says not to assume
 * so) — only well-known MMR/peripheral place names that are safe to match
 * without risking a false positive against a real Mumbai-city locality.
 * Genuine Mumbai localities that could be confused with a peripheral name
 * (e.g. "Dahisar" is Mumbai city, NOT Mira-Bhayandar, despite bordering it)
 * are deliberately left OUT of this list.
 */
export const MMR_PERIPHERAL_AREA_KEYWORDS: string[] = [
  "thane",
  "kalyan",
  "dombivli",
  "dombivali",
  "kalyan-dombivli",
  "kalyan dombivli",
  "mira road",
  "mira-bhayandar",
  "mira bhayandar",
  "bhayandar",
  "vasai",
  "virar",
  "vasai-virar",
  "vasai virar",
  "nalasopara",
  "nala sopara",
  "navi mumbai",
  "panvel",
  "kharghar",
  "vashi",
  "nerul",
  "airoli",
  "ghansoli",
  "koparkhairane",
  "kopar khairane",
  "belapur",
  "ulwe",
  "taloja",
  "badlapur",
  "ambernath",
  "kamothe",
  "seawoods",
];

/** Matches a bare `keyword` as its own word/phrase, not merely as a substring of an unrelated word. */
function containsKeyword(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(haystack);
}

/** Returns the first matching MMR keyword found in the given area text, or null if none matches. */
export function detectMmrPeripheralArea(areaText: string): string | null {
  const normalized = areaText.toLowerCase();
  for (const keyword of MMR_PERIPHERAL_AREA_KEYWORDS) {
    if (containsKeyword(normalized, keyword)) return keyword;
  }
  return null;
}
