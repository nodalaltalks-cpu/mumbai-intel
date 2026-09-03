import "server-only";
import type { EnrichmentField, SourceTier } from "./types";
import { applyAcceptedField } from "./applyAcceptedField";
import { getFieldTrustTier, PROTECTED_IDENTITY_FIELDS, UNSUPPORTED_FOR_AUTO_ACCEPT, type FieldTrustTier } from "./fieldTrustTiers";
import { resolveAreaToLocality, type ExistingLocalityWithAliases } from "../ingestion/discovery/areaLocalityResolution";
import { looksLikeSubpageOrMarketingTitle } from "../ingestion/discovery/generic/subpageTitleHeuristics";

/**
 * Phase 60 Part 10/11 — the thin automation-decision layer.
 *
 * Deliberately does NOT replace classifyProjectEnrichment's own
 * CONFIRMED/GREEN_NEW/YELLOW/CONFLICT/MISSING classification (Phase 60
 * Section 11: "existing classifier remains source of truth"). This function
 * only INTERPRETS an already-classified EnrichmentField into one of four
 * automation actions. It never fetches anything, never re-classifies a
 * field's agree/disagree status, and never writes to the database — see
 * autoDecideFieldAutomation.test.ts for the full behavioral contract and
 * the pilot script for how this is run read-only against real data.
 */
export type AutomationDecision = "AUTO_ACCEPT" | "HUMAN_REVIEW" | "REJECT" | "MISSING";

/** An extra, optional signal riding alongside `decision` — never changes the decision's meaning, only explains it further. NORMALIZED_MATCH is Phase 60 Section 3's explicit case: the locality resolver proves the proposed text is the SAME locality already on file, but the decision stays HUMAN_REVIEW (never silently overwritten) — the tag just tells a reviewer "this isn't a real disagreement." */
export type AutomationTag = "NORMALIZED_MATCH" | "SUBPAGE_OR_MARKETING_TITLE" | "GENERIC_MEDIA" | "UNRECOGNIZED_VALUE_FORMAT" | "PROTECTED_IDENTITY_FIELD" | "UNSUPPORTED_WRITE_PATH";

export interface FieldAutomationContext {
  /** Only meaningful for the "locality" field — the Project's CURRENT localityId, so a proposed text can be checked against it via the existing area-locality resolver rather than a raw string compare. Omit if unknown; the locality field then falls back to plain CONFLICT/HUMAN_REVIEW with no NORMALIZED_MATCH tag. */
  currentLocalityId?: string | null;
  /** Every Mumbai Locality with its aliases, for resolveAreaToLocality — the SAME shape and SAME resolver Discovery-Include already uses (lib/ingestion/discovery/areaLocalityResolution.ts). Required only to compute a NORMALIZED_MATCH tag for the locality field; harmless to omit. */
  localities?: ExistingLocalityWithAliases[];
}

export interface FieldAutomationResult {
  field: string;
  /** The exact classification this decision was computed from (Phase 60 Section 11's "inspect the actual classifier before mapping"). */
  classification: EnrichmentField["classification"];
  decision: AutomationDecision;
  reason: string;
  tier: FieldTrustTier | "PROTECTED" | "UNSUPPORTED" | null;
  sourceType: SourceTier | null;
  tag?: AutomationTag;
}

const TRUSTED_SOURCE_TIERS: ReadonlySet<SourceTier> = new Set(["GOVERNMENT", "OFFICIAL_DEVELOPER"]);

/** Small, explicit whitelist — Tier A demands "objectively verifiable"; applyAcceptedField accepts ANY non-empty string for reraStatus (it's a plain DIRECT_STRING_FIELDS passthrough with no format check), so this module adds its own narrow check rather than loosening that shared validator for every other caller. */
const KNOWN_RERA_STATUS_VALUES = new Set(["registered", "not registered", "expired", "renewed", "extended", "lapsed", "new registration"]);

/** Real examples seen across the 13 live adapters: "P51800080217", "PR1180002600863", "PM1180002501525". Same reasoning as KNOWN_RERA_STATUS_VALUES — applyAcceptedField's DIRECT_STRING_FIELDS passthrough doesn't check RERA number shape at all. */
const RERA_NUMBER_PATTERN = /^[A-Za-z]{1,4}[A-Za-z0-9]{6,}$/;

const MEDIA_FIELD_EXPECTED_EXTENSIONS: Record<string, RegExp> = {
  coverImage: /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i,
  images: /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i,
  ogImageUrl: /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i,
  brochure: /\.pdf(\?.*)?$/i,
  reraCertificateUrl: /\.pdf(\?.*)?$/i,
  videoUrl: /(youtube\.com|youtu\.be|vimeo\.com)/i,
  tour360Url: /./, // no reliable universal shape for 360-tour providers — structural-URL-validity is the only automatic check available
  documents: /\.pdf(\?.*)?$/i,
};

/** Filenames/paths that smell like a sitewide/generic asset rather than something specific to THIS project (Phase 60 Section 5: "not obviously a generic developer/sitewide image"). Deliberately conservative — only fires on unambiguous generic-asset naming, never on a plain descriptive filename. */
const GENERIC_MEDIA_PATH_SEGMENTS = /\b(logo|favicon|placeholder|default[-_]?(banner|image|og)?|site[-_]?wide|generic)\b/i;

function isStructurallyValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Phase 60 Section 5's media gate: official source (checked by the caller
 * via sourceType), project-specific (not a generic/sitewide asset path),
 * structurally valid URL, and the right asset type for the field.
 */
function checkMediaField(fieldKey: string, url: string): { ok: true } | { ok: false; reason: string; tag?: AutomationTag } {
  if (!isStructurallyValidUrl(url)) return { ok: false, reason: `"${url}" is not a structurally valid http(s) URL.` };
  if (GENERIC_MEDIA_PATH_SEGMENTS.test(url)) {
    return { ok: false, reason: `URL path looks like a generic/sitewide asset (logo, favicon, placeholder, ...), not something specific to this project.`, tag: "GENERIC_MEDIA" };
  }
  const expected = MEDIA_FIELD_EXPECTED_EXTENSIONS[fieldKey];
  if (expected && !expected.test(url)) {
    return { ok: false, reason: `URL does not look like the expected file/asset type for "${fieldKey}".` };
  }
  return { ok: true };
}

/**
 * Reuses the SAME curated micro-market/alias resolver Discovery-Include
 * already trusts (resolveAreaToLocality) to check whether a proposed
 * locality-field text is really just a differently-worded reference to the
 * CURRENT locality already on file (Phase 60 Section 3's Kalpataru
 * Vian/Rustomjee Seasons/Gurukrupa Dhyanam examples). Never overwrites
 * anything and never changes the decision away from HUMAN_REVIEW — this only
 * produces the NORMALIZED_MATCH tag so a reviewer can see at a glance that a
 * "conflict" isn't a real disagreement.
 */
function checkLocalityNormalizedMatch(proposedText: string, context: FieldAutomationContext): boolean {
  if (!context.currentLocalityId || !context.localities || context.localities.length === 0) return false;
  const resolved = resolveAreaToLocality(proposedText, context.localities);
  return resolved.status === "SINGLE_MATCH" && resolved.localityId === context.currentLocalityId;
}

/**
 * The one entry point. Pure given its inputs — no DB/network access, safe to
 * call in a read-only pilot or (once trusted) a real batch job. Never
 * mutates `field`.
 */
export function decideFieldAutomation(field: EnrichmentField, context: FieldAutomationContext = {}): FieldAutomationResult {
  const base = { field: field.key, classification: field.classification, sourceType: field.sourceType };

  // MISSING is never an error and never routes anywhere else (Phase 60 Section 10).
  if (field.classification === "MISSING") {
    return { ...base, decision: "MISSING", reason: field.reason, tier: getFieldTrustTier(field.key) };
  }

  // CONFIRMED means the source already agrees with the current value — there is
  // nothing to write. Treated as a no-op "already correct", never presented to
  // a reviewer (see this file's own doc comment / the report's discussion of
  // this deliberate simplification).
  if (field.classification === "CONFIRMED") {
    return { ...base, decision: "AUTO_ACCEPT", reason: "Already confirmed — current value matches the source; nothing to write.", tier: getFieldTrustTier(field.key) };
  }

  // Protected identity fields (Phase 60 Section 6): ANY proposed change —
  // GREEN_NEW (filling a blank), YELLOW, or CONFLICT — always goes to a human.
  // Checked BEFORE tier so no tier assignment can ever override it.
  if (PROTECTED_IDENTITY_FIELDS.has(field.key)) {
    if (field.key === "name" && field.proposedValue) {
      const titleCheck = looksLikeSubpageOrMarketingTitle(field.proposedValue);
      if (titleCheck.suspicious) {
        return {
          ...base,
          decision: "REJECT",
          reason: `Proposed name rejected, never a human-review candidate: ${titleCheck.reason}`,
          tier: "PROTECTED",
          tag: "SUBPAGE_OR_MARKETING_TITLE",
        };
      }
    }
    let tag: AutomationTag | undefined;
    let reason = `"${field.label}" is an identity-critical field — a proposed change is never auto-accepted, regardless of classification. (${field.reason})`;
    if (field.key === "locality" && field.classification === "CONFLICT" && field.proposedValue && checkLocalityNormalizedMatch(field.proposedValue, context)) {
      tag = "NORMALIZED_MATCH";
      reason = `The existing locality resolver confirms "${field.proposedValue}" refers to the SAME locality already on file — not a real disagreement. Still routed to human review, per policy: the locality field is never auto-overwritten in this phase.`;
    }
    return { ...base, decision: "HUMAN_REVIEW", reason, tier: "PROTECTED", tag };
  }

  // Any remaining CONFLICT or YELLOW always goes to a human (Section 11's
  // explicit mapping) — this is unconditional and comes before tier checks.
  if (field.classification === "CONFLICT") {
    return { ...base, decision: "HUMAN_REVIEW", reason: field.reason, tier: getFieldTrustTier(field.key) };
  }
  if (field.classification === "YELLOW") {
    return { ...base, decision: "HUMAN_REVIEW", reason: `${field.reason} (source itself flagged this as lower-confidence/ambiguous — never auto-accepted.)`, tier: getFieldTrustTier(field.key) };
  }

  // Only GREEN_NEW fields reach here.
  const tier = getFieldTrustTier(field.key);

  if (UNSUPPORTED_FOR_AUTO_ACCEPT.has(field.key)) {
    return { ...base, decision: "HUMAN_REVIEW", reason: `"${field.label}" cannot be safely auto-written by the existing field-accept path — needs a human.`, tier: "UNSUPPORTED", tag: "UNSUPPORTED_WRITE_PATH" };
  }

  if (!field.proposedValue) {
    return { ...base, decision: "HUMAN_REVIEW", reason: "GREEN_NEW but no proposed value present — unexpected shape, needs a human look.", tier };
  }

  // Cross-check against the REAL write path: if applyAcceptedField itself
  // would refuse this exact value, no tier can override that (Phase 60
  // Section 2: "value is structurally valid" is a hard requirement, and this
  // reuses the existing validator rather than re-implementing per-field
  // format rules).
  const applied = applyAcceptedField({}, field.key, field.proposedValue, field.proposedItems);
  if (!applied.ok) {
    return { ...base, decision: "HUMAN_REVIEW", reason: `The existing field-write validator rejected this value: ${applied.error}`, tier };
  }

  if (!field.sourceType || !TRUSTED_SOURCE_TIERS.has(field.sourceType)) {
    return { ...base, decision: "HUMAN_REVIEW", reason: `Source tier "${field.sourceType ?? "unknown"}" is not yet trusted enough for automatic acceptance.`, tier };
  }

  if (tier === "A") {
    if (field.key === "reraStatus" && !KNOWN_RERA_STATUS_VALUES.has(field.proposedValue.trim().toLowerCase())) {
      return { ...base, decision: "HUMAN_REVIEW", reason: `"${field.proposedValue}" is not a recognized RERA status value — needs a human look.`, tier, tag: "UNRECOGNIZED_VALUE_FORMAT" };
    }
    if (field.key === "reraNumber" && !RERA_NUMBER_PATTERN.test(field.proposedValue.trim())) {
      return { ...base, decision: "HUMAN_REVIEW", reason: `"${field.proposedValue}" does not match the expected RERA number shape — needs a human look.`, tier, tag: "UNRECOGNIZED_VALUE_FORMAT" };
    }
    return { ...base, decision: "AUTO_ACCEPT", reason: `Tier A field, GREEN_NEW, trusted official source (${field.sourceType}), value passes structural validation.`, tier };
  }

  if (tier === "D") {
    const mediaCheck = checkMediaField(field.key, field.proposedValue);
    if (!mediaCheck.ok) {
      return { ...base, decision: "HUMAN_REVIEW", reason: mediaCheck.reason, tier, tag: mediaCheck.tag };
    }
    return { ...base, decision: "AUTO_ACCEPT", reason: `Tier D media field, GREEN_NEW, trusted official source (${field.sourceType}), URL is project-specific and structurally valid for "${field.key}".`, tier };
  }

  // Tier B and Tier C: v1 policy is human review even on GREEN_NEW (Phase 60
  // Sections 3/4) — the resolver/adapter may be right, but precision hasn't
  // been measured yet.
  if (tier === "B") {
    return { ...base, decision: "HUMAN_REVIEW", reason: `Tier B field — structured but contextual; v1 policy routes these to human review to measure precision before auto-applying.`, tier };
  }
  if (tier === "C") {
    return { ...base, decision: "HUMAN_REVIEW", reason: `Tier C field — editorial/semantic; never auto-accepted in v1 regardless of confidence.`, tier };
  }

  return { ...base, decision: "HUMAN_REVIEW", reason: `No trust tier is registered for field "${field.key}" — defaulting to human review rather than guessing.`, tier: null };
}
