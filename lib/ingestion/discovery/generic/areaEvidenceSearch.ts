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

import { resolveAreaToLocality, type AreaLocalityMatch, type ExistingLocalityWithAliases } from "../areaLocalityResolution";

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

/**
 * Phase 63 — re-resolves a STORED `ProjectDiscoveryCandidatePayload.areaName`
 * back to a Locality. This is the piece decideCandidateFate.ts's own
 * `resolveBestAreaMatch` doesn't expose on its own: `areaName` is saved as
 * the winning evidence's raw text (e.g. "Andheri East on Western Express
 * Highway"), which — same as at first-resolution time — often does NOT
 * resolve as a whole string; it only resolved originally because
 * deriveAreaSearchStrings() tried shorter derived phrases from within it.
 * Calling resolveAreaToLocality() directly on the stored raw text (skipping
 * that derivation) was a real, confirmed bug: stageMumbaiDiscoveryCandidates.ts
 * used it to rebuild the cross-run duplicate-detection pool, silently
 * dropped every such candidate from that pool (NO_MATCH), and so re-staged
 * the exact same candidates on every re-run — a genuine idempotency failure
 * found by actually running the pipeline twice. Reuses the exact same
 * deriveAreaSearchStrings + resolveAreaToLocality pair decideCandidateFate.ts
 * already uses, just without that function's source-tier "weak source"
 * restriction (irrelevant here — we're not making a first-time trust
 * decision, only re-deriving which Locality an already-accepted areaName
 * maps to).
 */
export function resolveStoredAreaNameToLocality(areaName: string, localities: ExistingLocalityWithAliases[]): AreaLocalityMatch {
  for (const searchString of deriveAreaSearchStrings(areaName)) {
    const match = resolveAreaToLocality(searchString, localities);
    if (match.status !== "NO_MATCH") return match;
  }
  return { status: "NO_MATCH" };
}
