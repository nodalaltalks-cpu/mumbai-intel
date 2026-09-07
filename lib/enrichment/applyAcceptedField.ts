import { CATEGORY_LABEL, POSSESSION_MONTH_LABEL, STATUS_LABEL } from "@/lib/project-meta";
import { slugify } from "@/lib/slug";

export type ApplyAcceptedFieldResult = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

/**
 * Converts one EnrichmentField's already-classified proposal (or, per Phase
 * 67, a founder's own manually-typed value for a currently-MISSING field --
 * same write path, no second mechanism) into the exact shape the EXISTING
 * Project staging payload / reviewFieldRegistry.ts expects for that specific
 * key, and returns a NEW payload object with just that one key changed
 * (Phase 32 Part E) -- never mutates the object passed in.
 *
 * Every registry field this module can safely write is handled below. A
 * field is deliberately EXCLUDED (falls through to the final "cannot be
 * accepted" error) when writing it safely would require guessing something
 * this module has no way to verify:
 *  - `locality`/`builder` are foreign keys (localityId/builderId) resolved
 *    via the separate entity-match mechanism -- the proposed/typed value is
 *    a NAME, and resolving a name to the correct existing row is a matching
 *    problem outside this module's scope. Silently picking a row by name
 *    would risk pointing the project at the WRONG one. `microMarket` is a
 *    narrower exception: it's accepted as a raw name string straight into
 *    `microMarketId` (a pre-existing, deliberately looser convention for
 *    this one lower-stakes field, not a real foreign-key resolution).
 *  - `dataSource`/`sourceRef` describe the STAGING record's own origin
 *    (e.g. MagicBricks), not something an official source cross-checks or a
 *    founder types by hand.
 *
 * `description` and `launchDate` (Phase 28/60's earlier "deferred, not
 * guessed at" exclusions) are now handled below, Phase 67: the founder can
 * type either directly (the automation-decision layer still never
 * AUTO_ACCEPTs either -- description is Tier C, launchDate is Tier B, both
 * always HUMAN_REVIEW regardless -- this only unblocks the founder's own
 * manual accept/edit).
 *
 * `slug` (Targeted fix, Slug editability) is likewise founder-editable now:
 * it still auto-derives from `name` by default (unchanged), but a founder
 * can override it, normalized through the SAME slugify() every other slug
 * in this codebase uses. The REAL uniqueness enforcement stays exactly
 * where it always was -- ensureUniqueSlug's DB-backed collision-retry loop
 * at approval time (lib/actions/ingestion.ts) -- this function never
 * touches the database and never weakens that check.
 */
export function applyAcceptedField(
  currentPayload: Record<string, unknown>,
  fieldKey: string,
  proposedValue: string | null,
  proposedItems?: string[]
): ApplyAcceptedFieldResult {
  if (!proposedValue || !proposedValue.trim()) {
    return { ok: false, error: "This field has no proposed value to accept." };
  }
  const value = proposedValue.trim();

  if (fieldKey === "possessionMonth" || fieldKey === "possessionYear") {
    return applyPossessionField(currentPayload, fieldKey, value);
  }

  if (fieldKey === "status") {
    const key = reverseLabel(STATUS_LABEL, value);
    if (!key) return { ok: false, error: `"${value}" is not a recognized project status.` };
    return { ok: true, payload: { ...currentPayload, status: key } };
  }

  if (fieldKey === "category") {
    const key = reverseLabel(CATEGORY_LABEL, value);
    if (!key) return { ok: false, error: `"${value}" is not a recognized property category.` };
    return { ok: true, payload: { ...currentPayload, category: key } };
  }

  if (fieldKey === "priceMin") {
    const rupees = parseCurrencyToRupees(value);
    if (rupees === null) return { ok: false, error: `"${value}" is not a recognized price format.` };
    return { ok: true, payload: { ...currentPayload, priceMinRupees: rupees } };
  }

  if (fieldKey === "totalUnits" || fieldKey === "totalTowers") {
    const n = parsePlainNumber(value);
    if (n === null) return { ok: false, error: `"${value}" is not a valid number.` };
    return { ok: true, payload: { ...currentPayload, [fieldKey]: n } };
  }

  if (fieldKey === "launchDate") {
    const iso = parseIsoDate(value);
    if (iso === null) return { ok: false, error: `"${value}" is not a valid date (expected YYYY-MM-DD).` };
    return { ok: true, payload: { ...currentPayload, launchDateIso: iso } };
  }

  // Targeted fix (Slug editability) -- always normalized through the SAME
  // slugify() every other slug in this codebase goes through (Builder edits,
  // approval-time Project creation), so a founder-typed value can never
  // land in payload.slug in a shape ensureUniqueSlug's own DB-uniqueness
  // loop (lib/actions/ingestion.ts's applyProjectApproval) wasn't built to
  // expect. Uniqueness itself is NOT re-checked here on purpose -- this
  // function is synchronous and never touches the database (see this file's
  // own doc comment); the existing ensureUniqueSlug collision-retry loop is
  // the one and only place that's authoritative, and it runs unconditionally
  // at approval time regardless of what's staged here.
  if (fieldKey === "slug") {
    const normalized = slugify(value);
    if (!normalized) return { ok: false, error: `"${value}" does not contain any valid slug characters.` };
    return { ok: true, payload: { ...currentPayload, slug: normalized } };
  }

  if (fieldKey === "constructionPercent") {
    const n = parsePercent(value);
    if (n === null) return { ok: false, error: `"${value}" is not a valid percentage.` };
    return { ok: true, payload: { ...currentPayload, constructionPercent: n } };
  }

  if (fieldKey === "landAreaAcres") {
    const n = parseAcres(value);
    if (n === null) return { ok: false, error: `"${value}" is not a valid land area.` };
    return { ok: true, payload: { ...currentPayload, landAreaAcres: n } };
  }

  if (Object.hasOwn(ARRAY_WRAP_FIELDS, fieldKey)) {
    const payloadKey = ARRAY_WRAP_FIELDS[fieldKey];
    const items = proposedItems && proposedItems.length > 0 ? proposedItems : [value];
    return { ok: true, payload: { ...currentPayload, [payloadKey]: items } };
  }

  if (Object.hasOwn(DIRECT_STRING_FIELDS, fieldKey)) {
    const payloadKey = DIRECT_STRING_FIELDS[fieldKey];
    return { ok: true, payload: { ...currentPayload, [payloadKey]: value } };
  }

  return { ok: false, error: `Field "${fieldKey}" cannot be accepted directly.` };
}

export type ValidateEditResult = { ok: true } | { ok: false; error: string };

/**
 * Phase 36 -- client-safe pre-check for an in-progress edit to a proposed
 * enrichment value, BEFORE "Save Edit" is even allowed. Reuses the exact
 * same per-field-type rules `applyAcceptedField` itself enforces (same
 * parsers, same enum reverse-lookup, same currency/percent/acres formats) --
 * not a second validation system, just the front half of the same checks,
 * usable from a client component without needing a full staging payload
 * (the possession month/year special case, which DOES need the current
 * payload to resolve its other half, is intentionally not re-validated here
 * -- Accept still runs the full, authoritative check server-side via
 * applyAcceptedField either way).
 *
 * Deliberately does NOT enforce URL-shape validation for URL-ish fields
 * (googleMapsUrl, videoUrl, tour360Url, coverImage, brochure,
 * reraCertificateUrl, ogImageUrl): the existing admin Project form
 * (lib/project-data.ts's projectSchema) already treats every one of these
 * as a plain trimmed string with no `.url()` check -- matching that
 * existing convention rather than inventing a stricter one here.
 */
export function validateProposedEdit(fieldKey: string, value: string): ValidateEditResult {
  if (!value || !value.trim()) {
    return { ok: false, error: "This field can't be saved empty." };
  }
  const trimmed = value.trim();

  if (fieldKey === "possessionMonth") {
    const monthIndex = POSSESSION_MONTH_LABEL.findIndex((label) => label.toLowerCase() === trimmed.toLowerCase());
    return monthIndex >= 1 ? { ok: true } : { ok: false, error: `"${trimmed}" is not a recognized month.` };
  }

  if (fieldKey === "possessionYear") {
    const year = Number(trimmed);
    return Number.isInteger(year) && year >= 1900 && year <= 2100 ? { ok: true } : { ok: false, error: `"${trimmed}" is not a valid year.` };
  }

  if (fieldKey === "status") {
    return reverseLabel(STATUS_LABEL, trimmed) ? { ok: true } : { ok: false, error: `"${trimmed}" is not a recognized project status.` };
  }

  if (fieldKey === "category") {
    return reverseLabel(CATEGORY_LABEL, trimmed) ? { ok: true } : { ok: false, error: `"${trimmed}" is not a recognized property category.` };
  }

  if (fieldKey === "priceMin") {
    return parseCurrencyToRupees(trimmed) !== null
      ? { ok: true }
      : { ok: false, error: `"${trimmed}" is not a recognized price format (e.g. "₹1.25 Cr" or "₹45.00 L").` };
  }

  if (fieldKey === "totalUnits" || fieldKey === "totalTowers") {
    return parsePlainNumber(trimmed) !== null ? { ok: true } : { ok: false, error: `"${trimmed}" is not a valid number.` };
  }

  if (fieldKey === "launchDate") {
    return parseIsoDate(trimmed) !== null ? { ok: true } : { ok: false, error: `"${trimmed}" is not a valid date (expected YYYY-MM-DD).` };
  }

  if (fieldKey === "slug") {
    return slugify(trimmed) ? { ok: true } : { ok: false, error: `"${trimmed}" does not contain any valid slug characters.` };
  }

  if (fieldKey === "constructionPercent") {
    return parsePercent(trimmed) !== null ? { ok: true } : { ok: false, error: `"${trimmed}" is not a valid percentage (e.g. "45%").` };
  }

  if (fieldKey === "landAreaAcres") {
    return parseAcres(trimmed) !== null ? { ok: true } : { ok: false, error: `"${trimmed}" is not a valid land area (e.g. "2.5 acres").` };
  }

  // Every other field (plain strings, URL-ish strings, and array-shaped
  // fields edited item-by-item) only needs the non-empty check above.
  return { ok: true };
}

/** registryKey -> payloadKey, for fields whose payload property name differs from the field key the registry/UI use. Identical unless listed. */
const DIRECT_STRING_FIELDS: Record<string, string> = {
  name: "name",
  developerGroup: "developerGroup",
  tagline: "tagline",
  description: "description",
  microMarket: "microMarketId",
  address: "address",
  googleMapsUrl: "googleMapsUrl",
  developerWebsiteUrl: "developerWebsiteUrl",
  reraNumber: "reraNumber",
  reraCertificateUrl: "reraCertificateUrl",
  actualPossession: "actualPossession",
  coverImage: "coverImageUrl",
  videoUrl: "videoUrl",
  tour360Url: "tour360Url",
  brochure: "brochureUrl",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  ogImageUrl: "ogImageUrl",
};

/** registryKey -> payloadKey, for the count-displayed array fields (reviewFieldRegistry.ts's `Array.isArray(raw.X)` checks). */
const ARRAY_WRAP_FIELDS: Record<string, string> = {
  highlights: "highlights",
  specifications: "specifications",
  amenities: "amenities",
  faqs: "faqs",
  images: "images",
  documents: "documents",
  paymentPlans: "paymentPlans",
};

/** Special-cased-by-name fields handled directly in applyAcceptedField, above and beyond DIRECT_STRING_FIELDS/ARRAY_WRAP_FIELDS. */
const SPECIAL_CASED_FIELDS: ReadonlySet<string> = new Set([
  "possessionMonth",
  "possessionYear",
  "status",
  "category",
  "priceMin",
  "totalUnits",
  "totalTowers",
  "constructionPercent",
  "landAreaAcres",
  "launchDate",
  // Targeted fix (Slug editability) -- slug is no longer excluded: KEEP the
  // field (it's used for stable public URLs), but it needs its own
  // slugify()-normalizing branch above rather than a plain passthrough, so
  // it lives here rather than in DIRECT_STRING_FIELDS.
  "slug",
]);

/**
 * Phase 67 -- whether applyAcceptedField can actually write this field key at
 * all, independent of classification. Used to decide whether a founder gets
 * an Edit affordance for a currently-MISSING field (there's no proposed
 * value to edit-then-accept, but the founder can still type one from
 * scratch) -- reuses the exact same three lookups applyAcceptedField's own
 * dispatch already keys on, so this can never drift from what Accept would
 * actually do. Excludes locality/builder/dataSource/sourceRef -- see this
 * file's own top doc comment for why each is unsupported.
 */
export function isFieldManuallyEditable(fieldKey: string): boolean {
  return Object.hasOwn(DIRECT_STRING_FIELDS, fieldKey) || Object.hasOwn(ARRAY_WRAP_FIELDS, fieldKey) || SPECIAL_CASED_FIELDS.has(fieldKey);
}

export type FieldEditorKind = "array" | "payment-plan-list" | "enum-status" | "enum-category" | "month" | "date" | "text" | "textarea";

/**
 * Phase 36 -- tells EnrichmentProposalPanel which editing control a field
 * needs, reusing the SAME field-key classification `applyAcceptedField`
 * already keys its own logic on (ARRAY_WRAP_FIELDS, status/category,
 * possessionMonth) rather than a second, independent field taxonomy.
 * `longestSampleLength` is the proposed value's own length -- long strings
 * (e.g. an accepted tagline or description-like note) get a textarea
 * instead of a single-line input, a display choice only, not a new
 * validation rule.
 */
export function getFieldEditorKind(fieldKey: string, currentValueLength: number): FieldEditorKind {
  // Targeted fix (Payment Plan -- one clean founder field): paymentPlans
  // needs its own structured name+description list editor, not the generic
  // flat-string array editor every other ARRAY_WRAP_FIELDS entry uses --
  // checked BEFORE that generic branch.
  if (fieldKey === "paymentPlans") return "payment-plan-list";
  if (Object.hasOwn(ARRAY_WRAP_FIELDS, fieldKey)) return "array";
  if (fieldKey === "status") return "enum-status";
  if (fieldKey === "category") return "enum-category";
  if (fieldKey === "possessionMonth") return "month";
  if (fieldKey === "launchDate") return "date";
  return currentValueLength > 60 ? "textarea" : "text";
}

function reverseLabel<T extends string>(labels: Record<T, string>, value: string): T | null {
  const normalized = value.trim().toLowerCase();
  for (const key of Object.keys(labels) as T[]) {
    if (labels[key].toLowerCase() === normalized) return key;
  }
  return null;
}

/** Inverse of lib/format.ts's formatPaise, restricted to the exact shapes it produces ("₹X.XX Cr", "₹X.XX L", "₹N,NN,NNN") -- the only shape an EnrichmentField's proposedValue for priceMin can ever be in, since the adapters format via that same helper. Returns rupees (matching payload.priceMinRupees's own unit). */
function parseCurrencyToRupees(display: string): number | null {
  const cr = display.match(/₹\s*([\d,.]+)\s*Cr/i);
  if (cr) return Math.round(parseFloat(cr[1].replace(/,/g, "")) * 1e7);
  const lakh = display.match(/₹\s*([\d,.]+)\s*L\b/i);
  if (lakh) return Math.round(parseFloat(lakh[1].replace(/,/g, "")) * 1e5);
  const plain = display.match(/₹\s*([\d,]+)\s*$/);
  if (plain) return Math.round(Number(plain[1].replace(/,/g, "")));
  return null;
}

function parsePlainNumber(display: string): number | null {
  const n = Number(display.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Accepts the native `<input type="date">` value shape ("YYYY-MM-DD") -- the exact format the "date" FieldEditorKind's control emits. Returns a full ISO timestamp (matching payload.launchDateIso's own shape) or null for anything else, including a technically-parseable-by-Date but non-YYYY-MM-DD string (never guesses a locale-ambiguous "MM/DD" vs "DD/MM" input). */
function parseIsoDate(display: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(display.trim())) return null;
  const d = new Date(`${display.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parsePercent(display: string): number | null {
  const m = display.match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
}

function parseAcres(display: string): number | null {
  const m = display.match(/([\d.]+)\s*acres?/i);
  return m ? Number(m[1]) : null;
}

/**
 * possessionMonth/possessionYear are NOT independent payload fields --
 * reviewFieldRegistry.ts derives both from the single `possessionDateIso`
 * column. Accepting one alone needs the OTHER half from whatever
 * possessionDateIso already exists on the staging payload; if neither the
 * accepted value nor the existing payload can supply that other half, this
 * fails rather than fabricating a date. Accepting both fields in sequence
 * (two separate calls) works correctly: the second call reads the payload
 * this function just updated with the first.
 */
function applyPossessionField(
  currentPayload: Record<string, unknown>,
  fieldKey: "possessionMonth" | "possessionYear",
  value: string
): ApplyAcceptedFieldResult {
  const existingIso = typeof currentPayload.possessionDateIso === "string" ? currentPayload.possessionDateIso : undefined;
  const existingDate = existingIso ? new Date(existingIso) : null;
  const hasExisting = existingDate !== null && !Number.isNaN(existingDate.getTime());

  let month: number;
  let year: number;

  if (fieldKey === "possessionMonth") {
    const monthIndex = POSSESSION_MONTH_LABEL.findIndex((label) => label.toLowerCase() === value.toLowerCase());
    if (monthIndex < 1) return { ok: false, error: `"${value}" is not a recognized month.` };
    month = monthIndex;
    if (!hasExisting) return { ok: false, error: "Cannot set the possession month without an existing or already-accepted possession year." };
    year = existingDate!.getUTCFullYear();
  } else {
    const parsedYear = Number(value);
    if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
      return { ok: false, error: `"${value}" is not a valid year.` };
    }
    year = parsedYear;
    if (!hasExisting) return { ok: false, error: "Cannot set the possession year without an existing or already-accepted possession month." };
    month = existingDate!.getUTCMonth() + 1;
  }

  const iso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  return { ok: true, payload: { ...currentPayload, possessionDateIso: iso } };
}
