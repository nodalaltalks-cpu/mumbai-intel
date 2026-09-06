import "server-only";
import type { ProjectReviewContext } from "../ingestion/reviewFieldRegistry";
import type { ProjectImportPayload } from "../ingestion/connectors/fileImport/types";
import { classifyProjectEnrichment, mergeEnrichmentResults } from "./classifyEnrichment";
import type { EnrichmentConfidence, EnrichmentField, SourceFactsMap, SourceMeta, SourceTier } from "./types";

/**
 * Targeted fix (post-Phase 71B founder testing), Sections 6-10 — a
 * SMALL, provider-agnostic interface so a future research source (a web
 * search fallback, a second AI provider, anything) can propose values for
 * fields the official-developer adapter didn't cover, WITHOUT bypassing any
 * existing safety mechanism.
 *
 * Deliberately NOT a new classification/automation/history system: every
 * finding is funneled straight through the EXISTING
 * classifyProjectEnrichment + mergeEnrichmentResults (the same two functions
 * every official adapter's output already goes through), so a research
 * finding gets the exact same CONFIRMED/GREEN_NEW/YELLOW/CONFLICT/MISSING
 * treatment, the same decideFieldAutomation gate, and lands in the SAME
 * founder Accept/Edit/Reject review UI as any other enrichment field.
 * Nothing here writes to a database, calls a live search API, or publishes
 * anything -- see runResearchProviders' own doc comment.
 *
 * NO PROVIDER IS REGISTERED BY DEFAULT (see DEFAULT_RESEARCH_PROVIDERS
 * below) -- this ships the interface and the safe orchestration, not a
 * working Google-search integration (no search API credentials exist in
 * this environment; inventing a scraper here would violate both "do not
 * assume Google API credentials exist" and "do not build a huge new AI
 * system in this task"). Wiring a real provider later means implementing
 * ResearchProvider.research() and adding it to that list — nothing else
 * changes.
 */

export interface ResearchQuery {
  projectName: string;
  developerName?: string;
  /** Only these field keys need research -- a provider should not go looking for fields the founder didn't ask about, and should not report on fields outside this list. */
  fieldKeys: string[];
}

/**
 * One provider's claim about one field. Mirrors the "Source Display"
 * contract (Section 10): every finding MUST carry a real source URL,
 * confidence, and reasoning -- never fabricated, never a bare guess. A
 * provider that can't back a value with a real URL should omit that field
 * from its results entirely rather than inventing one (`sourceUrl` has no
 * "unknown" escape hatch here on purpose).
 */
export interface ResearchFinding {
  fieldKey: string;
  value: string;
  confidence: EnrichmentConfidence;
  sourceUrl: string;
  sourceType: SourceTier;
  /** Plain-language evidence summary shown to the founder (Section 10's "REASONING / EVIDENCE SUMMARY"). */
  reasoning: string;
  /** For array-shaped fields (amenities, paymentPlans, highlights, ...) -- the real underlying list, same convention as RawSourceFact.items. */
  items?: string[];
}

export interface ResearchProvider {
  name: string;
  /** Returns zero or more findings for the requested fields. Never guesses, never fabricates a URL -- an empty array is a completely valid, honest answer. */
  research(query: ResearchQuery): Promise<ResearchFinding[]>;
}

/** Ships empty on purpose -- see this file's own top doc comment. */
export const DEFAULT_RESEARCH_PROVIDERS: ResearchProvider[] = [];

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Runs every provider, classifies each DISTINCT source's findings through
 * the existing classifier (grouped by sourceUrl+sourceType, exactly like one
 * official adapter's fetchProjectFacts result), then merges — reusing
 * mergeEnrichmentResults' existing tier-priority rule for picking which
 * source's proposal is shown.
 *
 * Section 9's cross-check requirement goes one step further than
 * mergeEnrichmentResults alone provides: two research sources that propose
 * DIFFERENT non-blank values for the same field must be flagged CONFLICT,
 * not have the higher-tier source's answer silently win with no visible
 * disagreement (mergeEnrichmentResults was designed for "one official
 * adapter's own findings", where this situation never arose). This function
 * detects that case after merging and overrides the classification —
 * `decideFieldAutomation` already routes any CONFLICT to human review
 * unconditionally, so this is enough to guarantee no guessing.
 */
export async function runResearchProviders(
  providers: ResearchProvider[],
  query: ResearchQuery,
  currentPayload: ProjectImportPayload,
  context: ProjectReviewContext = {}
): Promise<EnrichmentField[]> {
  const allowedKeys = new Set(query.fieldKeys);
  const findings: ResearchFinding[] = [];
  for (const provider of providers) {
    const providerFindings = await provider.research(query);
    for (const finding of providerFindings) {
      if (!allowedKeys.has(finding.fieldKey)) continue; // a provider reporting outside what was asked is dropped, never silently accepted
      if (!finding.sourceUrl || !finding.reasoning) continue; // no fabricated/unsupported findings ever proceed
      findings.push(finding);
    }
  }
  if (findings.length === 0) return [];

  const bySource = new Map<string, { meta: SourceMeta; facts: SourceFactsMap }>();
  for (const finding of findings) {
    const sourceKey = `${finding.sourceUrl}|${finding.sourceType}`;
    if (!bySource.has(sourceKey)) {
      bySource.set(sourceKey, { meta: { url: finding.sourceUrl, tier: finding.sourceType }, facts: {} });
    }
    bySource.get(sourceKey)!.facts[finding.fieldKey] = {
      value: finding.value,
      confidence: finding.confidence,
      note: finding.reasoning,
      items: finding.items,
    };
  }

  const perSourceResults = [...bySource.values()].map(({ meta, facts }) => classifyProjectEnrichment(currentPayload, context, facts, meta));
  const merged = mergeEnrichmentResults(perSourceResults);

  // Cross-check: does more than one DISTINCT source disagree on this field's value?
  const valuesByField = new Map<string, Set<string>>();
  for (const finding of findings) {
    const set = valuesByField.get(finding.fieldKey) ?? new Set<string>();
    set.add(normalizeForCompare(finding.value));
    valuesByField.set(finding.fieldKey, set);
  }

  return merged.map((field) => {
    const distinctValues = valuesByField.get(field.key);
    if (!distinctValues || distinctValues.size < 2) return field;
    return {
      ...field,
      classification: "CONFLICT" as const,
      reason: "Independent research sources disagree on this field's value — never resolved by guessing; human review required.",
    };
  });
}
