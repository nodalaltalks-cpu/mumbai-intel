/**
 * Phase 60 Part 9 — a pure, single-source-of-truth lookup from each of the
 * existing Project registry field keys (lib/ingestion/reviewFieldRegistry.ts's
 * buildProjectReviewCompleteness) to an automation trust tier. Deliberately
 * just a lookup table, never scattered per-field automation logic — every
 * rule that CONSUMES a tier lives in autoDecideFieldAutomation.ts instead.
 *
 * Tier A — highly structured, objectively verifiable, safe to auto-accept
 *          (Phase 60 v1: RERA number/price min only — kept deliberately
 *          narrow per the "be conservative for v1" instruction; fields like
 *          status/category that ARE structured enums are still Tier B this
 *          round because getting them wrong has real business impact and
 *          neither was explicitly whitelisted). Phase 67 removed reraStatus
 *          and priceMax from this tier along with the fields entirely.
 * Tier B — structured but contextual; the resolver may understand it, but
 *          v1 always routes it to human review (never auto-applies).
 * Tier C — editorial/semantic; only ever human review in v1, regardless of
 *          how confident the source claims to be.
 * Tier D — media; conditionally auto-acceptable only when the field-specific
 *          media checks in autoDecideFieldAutomation.ts pass.
 *
 * PROTECTED fields (name/developerGroup/locality) are identity-critical —
 * checked FIRST, before tier, and can never auto-accept a changed value
 * regardless of tier (Phase 60 Section 6).
 */

export type FieldTrustTier = "A" | "B" | "C" | "D";

/** name/developerGroup/locality — see this module's own doc comment. Checked before tier in autoDecideFieldAutomation.ts. */
export const PROTECTED_IDENTITY_FIELDS: ReadonlySet<string> = new Set(["name", "developerGroup", "locality"]);

/**
 * Fields the existing write path (lib/enrichment/applyAcceptedField.ts) can
 * never accept directly, by its own explicit design (see that file's doc
 * comment) — builder/locality are foreign keys resolved via the separate
 * entity-match mechanism, slug is always auto-derived. Never AUTO_ACCEPT any
 * of these regardless of tier; the decision function also cross-checks this
 * at runtime via applyAcceptedField's own ok/error result rather than
 * trusting this list alone, since that list is the actual runtime authority.
 * Phase 67 moved `description` and `launchDate` OUT of this set —
 * applyAcceptedField now supports both (a founder can type either directly);
 * this changes nothing about automation itself, since description (Tier C)
 * and launchDate (Tier B) already always route to HUMAN_REVIEW on their own.
 */
export const UNSUPPORTED_FOR_AUTO_ACCEPT: ReadonlySet<string> = new Set([
  "builder",
  "slug",
  "locality",
  "dataSource",
  "sourceRef",
]);

const TIER_A_FIELDS: readonly string[] = ["reraNumber", "priceMin"];

const TIER_B_FIELDS: readonly string[] = [
  "locality",
  "microMarket",
  "address",
  "googleMapsUrl",
  "developerWebsiteUrl",
  "status",
  "category",
  "launchDate",
  "actualPossession",
  "possessionMonth",
  "possessionYear",
  "constructionPercent",
  "landAreaAcres",
  "totalUnits",
  "totalTowers",
  "dataSource",
  "sourceRef",
];

const TIER_C_FIELDS: readonly string[] = [
  "tagline",
  "description",
  "highlights",
  "specifications",
  "amenities",
  "faqs",
  "metaTitle",
  "metaDescription",
  // Targeted fix (post-Phase 71B founder testing) -- multiple payment plans,
  // same editorial/list nature as highlights/amenities above.
  "paymentPlans",
];

const TIER_D_FIELDS: readonly string[] = ["coverImage", "images", "videoUrl", "tour360Url", "brochure", "documents", "ogImageUrl", "reraCertificateUrl"];

const FIELD_TRUST_TIERS: Record<string, FieldTrustTier> = Object.fromEntries([
  ...TIER_A_FIELDS.map((k) => [k, "A" as const]),
  ...TIER_B_FIELDS.map((k) => [k, "B" as const]),
  ...TIER_C_FIELDS.map((k) => [k, "C" as const]),
  ...TIER_D_FIELDS.map((k) => [k, "D" as const]),
]);

/** name/developerGroup/builder are intentionally absent from every tier list above — they're either PROTECTED (name, developerGroup) or write-unsupported (builder), never tiered for auto-accept. Returns null for any field key this table has no opinion on (never guesses a tier). */
export function getFieldTrustTier(fieldKey: string): FieldTrustTier | null {
  return FIELD_TRUST_TIERS[fieldKey] ?? null;
}
