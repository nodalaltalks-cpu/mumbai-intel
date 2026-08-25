import type { RawCandidate } from "./candidates";
import type { CandidateSource, ScoredProject } from "./types";

/**
 * Deterministic, rule-based ranking (Part 13 of the implementation phases —
 * no ML). Base weight per candidate source reflects how strong a signal
 * that source is (Part 12): an explicit profile match and a project the
 * user is actively engaged with (similar-project seed) outrank a purely
 * platform-wide trending signal, which outranks pure exploration.
 */
const SOURCE_WEIGHT: Record<CandidateSource, number> = {
  PROFILE_MATCH: 70,
  RECENT_BEHAVIOR: 60,
  SIMILAR_PROJECT: 55,
  TRENDING: 40,
  NEW: 35,
  EXPLORATION: 20,
};

// A project recommended by multiple independent sources is a stronger
// candidate than the sum of two mediocre sources would suggest — but
// summing raw weights would let 3 weak sources outrank 1 very strong one,
// so additional sources add a shrinking bonus instead of full weight.
function combineScores(weights: number[]): number {
  const sorted = [...weights].sort((a, b) => b - a);
  return sorted.reduce((total, w, i) => total + w * Math.pow(0.5, i), 0);
}

export interface DiversificationOptions {
  /** Max cards from the same locality in the final list (Part 17). */
  maxPerLocality: number;
  /** Reserve at least this many EXPLORATION-sourced slots when available (Part 18). */
  minExplorationSlots: number;
}

const DEFAULT_DIVERSIFICATION: DiversificationOptions = { maxPerLocality: 2, minExplorationSlots: 1 };

export function rankAndDiversify(candidates: RawCandidate[], limit: number, options: DiversificationOptions = DEFAULT_DIVERSIFICATION): ScoredProject[] {
  const byProjectId = new Map<string, ScoredProject>();

  for (const candidate of candidates) {
    const existing = byProjectId.get(candidate.project.id);
    if (existing) {
      if (!existing.sources.includes(candidate.source)) existing.sources.push(candidate.source);
      if (!existing.reasons.some((r) => r.label === candidate.reason.label)) existing.reasons.push(candidate.reason);
    } else {
      byProjectId.set(candidate.project.id, {
        project: candidate.project,
        score: 0,
        reasons: [candidate.reason],
        sources: [candidate.source],
      });
    }
  }

  for (const scored of byProjectId.values()) {
    scored.score = combineScores(scored.sources.map((s) => SOURCE_WEIGHT[s]));
  }

  const ranked = [...byProjectId.values()].sort((a, b) => b.score - a.score);

  // Diversification pass: walk the ranked list, skip anything that would
  // exceed the per-locality cap, keep going until `limit` is filled or the
  // pool runs out.
  const localityCounts = new Map<string, number>();
  const final: ScoredProject[] = [];
  const skipped: ScoredProject[] = [];

  for (const item of ranked) {
    if (final.length >= limit) break;
    const localityId = item.project.localityId;
    const count = localityCounts.get(localityId) ?? 0;
    if (count >= options.maxPerLocality) {
      skipped.push(item);
      continue;
    }
    localityCounts.set(localityId, count + 1);
    final.push(item);
  }
  // Backfill from skipped (over-cap) items only if diversification left the list short.
  for (const item of skipped) {
    if (final.length >= limit) break;
    final.push(item);
  }

  // Guarantee a minimum exploration slice (Part 18) — if none made it in on
  // score alone, swap the lowest-scored non-exploration item for the
  // best-scoring exploration candidate still available.
  const explorationInFinal = final.filter((f) => f.sources.includes("EXPLORATION")).length;
  if (explorationInFinal < options.minExplorationSlots) {
    const bestExploration = ranked.find((r) => r.sources.includes("EXPLORATION") && !final.includes(r));
    if (bestExploration && final.length > 0) {
      final[final.length - 1] = bestExploration;
    }
  }

  return final;
}
