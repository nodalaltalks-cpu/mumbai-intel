import type { EnrichmentField } from "./types";

/**
 * Targeted fix (Research Automation) -- the curated set of Project registry
 * field keys this research layer will ever ask about. Deliberately narrower
 * than the full ~39-field registry (lib/ingestion/reviewFieldRegistry.ts):
 *  - "configuration" and "developer spokesperson" (mentioned in the task
 *    spec as potential targets) have NO representation anywhere on
 *    ProjectImportPayload at all -- Configuration is a child row of a real,
 *    already-approved Project; Developer Spokesperson lives only on
 *    BuilderImportPayload/Builder (see lib/ingestion/founderReviewFields.ts's
 *    own doc comment for this exact, pre-existing exclusion). Neither can be
 *    a research TARGET for a still-PENDING Project staging record.
 *  - "slug" is a workflow/URL field, not a fact ever published on a source
 *    page -- it's derived from `name`, not researched.
 * Every key below is a real key `classifyProjectEnrichment`/
 * `applyAcceptedField` already understand, so a research finding for any of
 * them flows through the EXACT SAME accept/edit/reject path as an official
 * adapter's own finding.
 */
export const RESEARCHABLE_FIELD_KEYS: readonly string[] = [
  "name",
  "developerGroup",
  "locality",
  "microMarket",
  "status",
  "category",
  "address",
  "priceMin",
  "reraNumber",
  "possessionMonth",
  "possessionYear",
  "description",
  "highlights",
  "amenities",
  "developerWebsiteUrl",
  "coverImage",
  "brochure",
];

const RESEARCHABLE_SET = new Set(RESEARCHABLE_FIELD_KEYS);

/**
 * Which of this project's CURRENT fields are actually worth researching --
 * MISSING (no value at all), or already flagged NEEDS_REVIEW/CONFLICT/
 * proposal-worthy by a prior run -- restricted to the curated researchable
 * set above. A field the founder already resolved (CONFIRMED, or
 * FOUNDER_EDITED -- Task 2's authoritative-value classification) is never a
 * research target: one missing field never blocks research of the others,
 * since this is a pure filter over the full field list, not a sequential
 * pipeline.
 */
const RESEARCH_WORTHY_CLASSIFICATIONS = new Set<EnrichmentField["classification"]>(["MISSING", "YELLOW", "CONFLICT"]);

export function selectResearchTargetFields(fields: EnrichmentField[], requestedFieldKeys?: string[]): string[] {
  const requested = requestedFieldKeys ? new Set(requestedFieldKeys) : null;
  return fields
    .filter((f) => RESEARCHABLE_SET.has(f.key))
    .filter((f) => RESEARCH_WORTHY_CLASSIFICATIONS.has(f.classification))
    .filter((f) => !requested || requested.has(f.key))
    .map((f) => f.key);
}

export interface ResearchQuerySet {
  fieldKey: string;
  queries: string[];
}

/**
 * Project-specific search queries per target field (Section 11 of the task
 * spec). Deliberately plain string generation, no network call -- this is
 * the query PLAN a research provider (a future BrowserResearchProvider, or
 * a manually-run interactive Claude+Chrome session) is expected to execute;
 * nothing here fetches anything. Always includes the developer name when
 * known, to reduce false matches against a similarly-named project by a
 * different developer (Section 12's own warning).
 */
export function generateResearchQueries(context: { projectName: string; developerName?: string }): ResearchQuerySet[] {
  const { projectName, developerName } = context;
  const withDeveloper = developerName ? `${projectName} ${developerName}` : projectName;

  const byField: Record<string, string[]> = {
    name: [`"${projectName}" ${developerName ?? ""} official project`.trim()],
    developerGroup: developerName ? [`"${developerName}" official website`, `"${projectName}" developer`] : [`"${projectName}" developer`],
    locality: [`${withDeveloper} address Mumbai`, `${withDeveloper} locality`],
    microMarket: [`${withDeveloper} micro market Mumbai`],
    status: [`${withDeveloper} construction status`],
    category: [`${withDeveloper} residential configuration`],
    address: [`${withDeveloper} address Mumbai`],
    priceMin: [`${withDeveloper} price`, `${withDeveloper} starting price`],
    reraNumber: [`${withDeveloper} MahaRERA`, `${withDeveloper} RERA number`],
    possessionMonth: [`${withDeveloper} possession`],
    possessionYear: [`${withDeveloper} possession`],
    description: [`${withDeveloper} project overview`],
    highlights: [`${withDeveloper} project highlights`],
    amenities: [`${withDeveloper} amenities`],
    developerWebsiteUrl: developerName ? [`"${developerName}" official website`] : [],
    coverImage: [`${withDeveloper} brochure`],
    brochure: [`${withDeveloper} brochure`],
  };

  return RESEARCHABLE_FIELD_KEYS.map((fieldKey) => ({ fieldKey, queries: byField[fieldKey] ?? [withDeveloper] })).filter(
    (set) => set.queries.length > 0
  );
}
