/**
 * Phase 56 Part A — turns one piece of free-text locality evidence (a whole
 * `<title>`, an OG title, a URL slug, a breadcrumb trail…) into an ordered
 * list of candidate strings worth trying against the EXISTING locality
 * resolver (`resolveAreaToLocality`). A title like "3 BHK Homes in Mulund
 * West | Piramal Realty" or a slug like "piramal-revanta-mulund-west" never
 * resolves as a whole string — the real locality name is a short phrase
 * embedded inside it. This stays a pure, dependency-free string transform;
 * the actual resolution (and its EXACT/MICRO_MARKET/FUZZY tiering) is still
 * entirely owned by areaLocalityResolution.ts, never reimplemented here.
 */

const SPLIT_PATTERN = /[|,;•]|\s[-–—]\s|\b(?:in|at|near)\b/i;

/** Pure. Ordered, deduped candidate strings: the full text first, then delimiter-split segments, then 3- and 2-word sliding windows (catches a locality name buried inside a longer slug/title with no delimiter at all). */
export function deriveAreaSearchStrings(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const candidates: string[] = [trimmed];
  const seen = new Set<string>([trimmed.toLowerCase()]);

  const addCandidate = (value: string) => {
    const v = value.trim();
    if (v.length < 3) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(v);
  };

  for (const segment of trimmed.split(SPLIT_PATTERN)) addCandidate(segment);

  const words = trimmed
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  for (const size of [3, 2]) {
    for (let i = 0; i + size <= words.length; i++) {
      addCandidate(words.slice(i, i + size).join(" "));
    }
  }

  return candidates;
}
