import type { LabeledExample } from "./dataset";
import type { LogisticModelWeights } from "./model";
import { predictProbability } from "./model";

/**
 * Part 11 — offline evaluation. Ranking metrics (Precision@K/Recall@K/
 * NDCG@K) are computed per RECOMMENDATION LIST, not per example — examples
 * are grouped back into the lists they were originally shown in (same
 * subject + surface + the same request, reconstructed by rounding
 * createdAt to the second, since every impression from one page render is
 * written within the same after() callback — effectively simultaneous).
 */

export interface EvaluationMetrics {
  sampleCount: number;
  listCount: number;
  ctr: number | null;
  saveOrCompareRate: number | null; // DEEP_ENGAGEMENT+ as a fraction of impressions
  enquiryRate: number | null;
  precisionAtK: number | null;
  recallAtK: number | null;
  ndcgAtK: number | null;
  k: number;
}

function groupKey(example: LabeledExample): string {
  const subject = example.publicUserId ?? example.sessionId ?? "anon";
  const secondBucket = Math.floor(example.createdAt.getTime() / 1000);
  return `${subject}:${example.surface ?? "unknown"}:${secondBucket}`;
}

function groupIntoLists(examples: LabeledExample[]): LabeledExample[][] {
  const groups = new Map<string, LabeledExample[]>();
  for (const ex of examples) {
    const key = groupKey(ex);
    const list = groups.get(key) ?? [];
    list.push(ex);
    groups.set(key, list);
  }
  return [...groups.values()];
}

function dcg(relevances: number[]): number {
  return relevances.reduce((sum, rel, i) => sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2), 0);
}

/** Evaluates a ranking (by a scoring function) against ground-truth outcomes, list by list. Used both for "how good is Phase 1's own historical ranking" and "how good would ML's ranking have been" (Part 8's comparison). */
function evaluateRanking(lists: LabeledExample[][], scoreFn: (ex: LabeledExample) => number, k: number): { precisionAtK: number | null; recallAtK: number | null; ndcgAtK: number | null } {
  const usableLists = lists.filter((l) => l.length >= 2); // a 1-item list can't meaningfully rank
  if (usableLists.length === 0) return { precisionAtK: null, recallAtK: null, ndcgAtK: null };

  let precisionSum = 0;
  let recallSum = 0;
  let ndcgSum = 0;

  for (const list of usableLists) {
    const ranked = [...list].sort((a, b) => scoreFn(b) - scoreFn(a));
    const topK = ranked.slice(0, k);
    const relevantInTopK = topK.filter((ex) => ex.binaryLabel === 1).length;
    const totalRelevant = list.filter((ex) => ex.binaryLabel === 1).length;

    precisionSum += relevantInTopK / topK.length;
    recallSum += totalRelevant > 0 ? relevantInTopK / totalRelevant : 0;

    const idealRanked = [...list].sort((a, b) => b.outcome - a.outcome).slice(0, k);
    const idealDcg = dcg(idealRanked.map((ex) => ex.outcome));
    const actualDcg = dcg(topK.map((ex) => ex.outcome));
    ndcgSum += idealDcg > 0 ? actualDcg / idealDcg : 0;
  }

  return {
    precisionAtK: Math.round((precisionSum / usableLists.length) * 1000) / 1000,
    recallAtK: Math.round((recallSum / usableLists.length) * 1000) / 1000,
    ndcgAtK: Math.round((ndcgSum / usableLists.length) * 1000) / 1000,
  };
}

export function evaluateExamples(examples: LabeledExample[], scoreFn: (ex: LabeledExample) => number, k = 5): EvaluationMetrics {
  const lists = groupIntoLists(examples);
  const ranking = evaluateRanking(lists, scoreFn, k);

  const impressionCount = examples.length;
  const clicks = examples.filter((ex) => ex.outcome >= 1).length;
  const deepEngagement = examples.filter((ex) => ex.outcome >= 2).length;
  const enquiries = examples.filter((ex) => ex.outcome >= 3).length;

  return {
    sampleCount: impressionCount,
    listCount: lists.length,
    ctr: impressionCount > 0 ? Math.round((clicks / impressionCount) * 1000) / 1000 : null,
    saveOrCompareRate: impressionCount > 0 ? Math.round((deepEngagement / impressionCount) * 1000) / 1000 : null,
    enquiryRate: impressionCount > 0 ? Math.round((enquiries / impressionCount) * 1000) / 1000 : null,
    ...ranking,
    k,
  };
}

/** Phase 1's own historical ranking, evaluated using the score it actually recorded at impression time — the true "what the user actually saw" baseline. */
export function evaluatePhase1(examples: LabeledExample[], k = 5): EvaluationMetrics {
  return evaluateExamples(examples, (ex) => ex.phase1Score ?? 0, k);
}

/** What the ML model WOULD have ranked, evaluated against the same real outcomes (Part 8/9 shadow comparison) — never the model's own training-time predictions, always a fresh scoring pass. */
export function evaluateModel(examples: LabeledExample[], model: LogisticModelWeights, k = 5): EvaluationMetrics {
  return evaluateExamples(examples, (ex) => predictProbability(model, ex.featureVector), k);
}
