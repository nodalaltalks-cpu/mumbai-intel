/**
 * Phase 60 Part 9 — a pure, single-source-of-truth lookup from each of the
 * existing 44 Project registry field keys (lib/ingestion/reviewFieldRegistry.ts's
 * buildProjectReviewCompleteness) to an automation trust tier. Deliberately
 * just a lookup table, never scattered per-field automation logic — every
 * rule that CONSUMES a tier lives in autoDecideFieldAutomation.ts instead.
 *
 * Tier A — highly structured, objectively verifiable, safe to auto-accept
 *          (Phase 60 v1: RERA number/status, price min/max only — kept
 *          deliberately narrow per the "be conservative for v1" instruction;
 *          fields like status/category that ARE structured enums are still
 *          Tier B this round because getting them wrong has real business
 *          impact and neither was explicitly whitelisted).
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
 * entity-match mechanism, slug is always auto-derived, description is a
 * documented better-prose exception, launchDate has no adapter-produced
 * parser yet. Never AUTO_ACCEPT any of these regardless of tier; the
 * decision function also cross-checks this at runtime via
 * applyAcceptedField's own ok/error result rather than trusting this list
 * alone, since that list is the actual runtime authority.
 */
export const UNSUPPORTED_FOR_AUTO_ACCEPT: ReadonlySet<string> = new Set([
  "builder",
  "slug",
  "locality",
  "description",
  "launchDate",
  "dataSource",
  "sourceRef",
]);

const TIER_A_FIELDS: readonly string[] = ["reraNumber", "reraStatus", "priceMin", "priceMax"];

const TIER_B_FIELDS: readonly string[] = [
  "locality",
  "microMarket",
  "address",
  "googleMapsUrl",
  "latitude",
  "longitude",
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
  "paymentPlanType",
  "paymentPlanDescription",
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
