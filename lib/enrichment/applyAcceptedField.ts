import { CATEGORY_LABEL, POSSESSION_MONTH_LABEL, STATUS_LABEL } from "@/lib/project-meta";

export type ApplyAcceptedFieldResult = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

/**
 * Converts one EnrichmentField's already-classified proposal into the exact
 * shape the EXISTING Project staging payload / reviewFieldRegistry.ts expects
 * for that specific key, and returns a NEW payload object with just that one
 * key changed (Phase 32 Part E) -- never mutates the object passed in.
 *
 * Every registry field the two live adapters (Godrej, Adani) can actually
 * produce a value for is handled below. A field is deliberately EXCLUDED
 * (falls through to the final "cannot be accepted" error) when accepting it
 * safely would require guessing something this module has no way to verify:
 *  - `locality`/`builder` are foreign keys (localityId/builderId) -- the
 *    proposed value is a NAME, and resolving a name to the correct existing
 *    row is a matching problem outside this phase's scope. Silently picking
 *    a locality/builder by name would risk pointing the project at the
 *    WRONG row.
 *  - `slug` is always auto-derived at approval time, never a real field.
 *  - `description` is Phase 28's own documented exception (better prose,
 *    same topic -- not suited to a blunt accept/reject).
 *  - `launchDate` has no adapter-produced value yet to model a parser
 *    against; deferred rather than guessed at.
 *  - `dataSource`/`sourceRef` describe the STAGING record's own origin
 *    (e.g. MagicBricks), not something an official source cross-checks.
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

  if (fieldKey === "priceMin" || fieldKey === "priceMax") {
    const rupees = parseCurrencyToRupees(value);
    if (rupees === null) return { ok: false, error: `"${value}" is not a recognized price format.` };
    const payloadKey = fieldKey === "priceMin" ? "priceMinRupees" : "priceMaxRupees";
    return { ok: true, payload: { ...currentPayload, [payloadKey]: rupees } };
  }

  if (fieldKey === "latitude" || fieldKey === "longitude" || fieldKey === "totalUnits" || fieldKey === "totalTowers") {
    const n = parsePlainNumber(value);
    if (n === null) return { ok: false, error: `"${value}" is not a valid number.` };
    return { ok: true, payload: { ...currentPayload, [fieldKey]: n } };
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

/** registryKey -> payloadKey, for fields whose payload property name differs from the field key the registry/UI use. Identical unless listed. */
const DIRECT_STRING_FIELDS: Record<string, string> = {
  name: "name",
  developerGroup: "developerGroup",
  tagline: "tagline",
  microMarket: "microMarketId",
  address: "address",
  googleMapsUrl: "googleMapsUrl",
  reraNumber: "reraNumber",
  reraStatus: "reraStatus",
  reraCertificateUrl: "reraCertificateUrl",
  paymentPlanType: "paymentPlanType",
  paymentPlanDescription: "paymentPlanDescription",
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
};

function reverseLabel<T extends string>(labels: Record<T, string>, value: string): T | null {
  const normalized = value.trim().toLowerCase();
  for (const key of Object.keys(labels) as T[]) {
    if (labels[key].toLowerCase() === normalized) return key;
  }
  return null;
}

/** Inverse of lib/format.ts's formatPaise, restricted to the exact shapes it produces ("₹X.XX Cr", "₹X.XX L", "₹N,NN,NNN") -- the only shapes an EnrichmentField's proposedValue for priceMin/priceMax can ever be in, since both adapters format via that same helper. Returns rupees (matching payload.priceMin/MaxRupees's own unit). */
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
