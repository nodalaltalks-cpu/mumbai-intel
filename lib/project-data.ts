import "server-only";
import { z } from "zod";
import { CONFIDENCE_LEVELS, DATA_SOURCES, PAYMENT_PLAN_TYPES, PROJECT_STATUSES, PROPERTY_CATEGORIES } from "@/lib/project-meta";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

/**
 * Plain (non-"use server") module — Next.js requires every export of a
 * "use server" file to itself be an async Server Action, so the shared,
 * synchronous Project field-mapping logic lives here instead. Both
 * lib/actions/projects.ts (the admin form) and lib/actions/ingestion.ts
 * (the bulk-import approve path) import from this one place.
 */

const MAX_META_TITLE = 70;
const MAX_META_DESCRIPTION = 160;

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
// Same null/undefined normalization as emptyToUndefined, but landing on "" instead of
// undefined -- for the two fields that must stay REQUIRED (name, localityId) rather than
// optional. A missing FormData entry (formData.get() returns null; e.g. a field that
// isn't in the DOM at submit time for any reason) would otherwise hit Zod's generic
// "expected string, received null" type-mismatch instead of the field's own friendly
// "X is required" message -- confusing for an admin with no way to tell which field.
const nullToEmptyString = (v: unknown) => (v === null || v === undefined ? "" : v);

const projectSchemaShape = {
  name: z.preprocess(nullToEmptyString, z.string().trim().min(1, "Name is required")),
  slug: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  tagline: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  builderId: z.preprocess(emptyToUndefined, z.string().optional()),
  developerGroup: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  localityId: z.preprocess(nullToEmptyString, z.string().min(1, "Locality is required")),
  microMarketId: z.preprocess(emptyToUndefined, z.string().optional()),
  highlights: z.preprocess(emptyToUndefined, z.string().optional()),
  // Both have a DB default (see prisma/schema.prisma) so a blank submission is never
  // actually invalid at the storage layer -- required only to *publish*, enforced below
  // by the superRefine instead of here, so an incomplete draft can still be saved.
  status: z.preprocess(emptyToUndefined, z.enum(PROJECT_STATUSES).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(PROPERTY_CATEGORIES).optional()),
  address: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  famousLandmark: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  latitude: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  longitude: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  googleMapsUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  launchDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  // promisedPossession is only ever supplied directly by non-form callers (bulk-import CSV
  // rows carry a real date) — the admin form instead submits possessionMonth/possessionYear
  // below, and buildProjectData()'s reconcilePossession() derives promisedPossession from
  // those so `possession_asc` sort and the ready/1yr/2yr/later filter keep working unchanged.
  promisedPossession: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  actualPossession: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  possessionMonth: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional()),
  possessionYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(2000).max(2100).optional()),
  constructionPercent: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  reraNumber: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  reraStatus: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  reraCertificateUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  totalUnits: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  totalTowers: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  landAreaAcres: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  priceMinRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  priceMaxRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  paymentPlanType: z.preprocess(emptyToUndefined, z.enum(PAYMENT_PLAN_TYPES).optional()),
  paymentPlanDescription: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  // Both also have a DB default; the admin form always pre-fills a real value, but a
  // non-form caller (e.g. a bulk-import CSV row, see lib/actions/ingestion.ts) may
  // genuinely omit them -- same blank-tolerance as status/category above.
  dataSource: z.preprocess(emptyToUndefined, z.enum(DATA_SOURCES).optional()),
  confidence: z.preprocess(emptyToUndefined, z.enum(CONFIDENCE_LEVELS).optional()),
  sourceRef: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  videoUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  tour360Url: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  isPublished: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isFeatured: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isTrending: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isLuxury: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isAffordable: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  metaTitle: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_TITLE).optional()),
  metaDescription: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_DESCRIPTION).optional()),
  ogImageUrl: z.preprocess(emptyToUndefined, z.string().trim().optional()),
};

/**
 * Draft vs publish is not a separate workflow/table -- it's the same `isPublished`
 * flag already on the form (see the Publishing tab), just enforced here: a draft
 * (isPublished false) can be saved with status/category left blank, same as every
 * other "important"-but-optional field (RERA number, launch date, ...); flipping
 * isPublished to true is what actually requires them, with a friendly per-field
 * message instead of Zod's generic enum type-mismatch text.
 */
export const projectSchema = z.object(projectSchemaShape).superRefine((data, ctx) => {
  if (!data.isPublished) return;
  if (!data.status) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Status is required to publish this project." });
  }
  if (!data.category) {
    ctx.addIssue({ code: "custom", path: ["category"], message: "Category is required to publish this project." });
  }
});

export type ProjectSchemaInput = z.infer<typeof projectSchema>;

export function parseProjectForm(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    tagline: formData.get("tagline"),
    description: formData.get("description"),
    builderId: formData.get("builderId"),
    developerGroup: formData.get("developerGroup"),
    localityId: formData.get("localityId"),
    microMarketId: formData.get("microMarketId"),
    highlights: formData.get("highlights"),
    status: formData.get("status"),
    category: formData.get("category"),
    address: formData.get("address"),
    famousLandmark: formData.get("famousLandmark"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    googleMapsUrl: formData.get("googleMapsUrl"),
    launchDate: formData.get("launchDate"),
    promisedPossession: formData.get("promisedPossession"),
    actualPossession: formData.get("actualPossession"),
    possessionMonth: formData.get("possessionMonth"),
    possessionYear: formData.get("possessionYear"),
    constructionPercent: formData.get("constructionPercent"),
    reraNumber: formData.get("reraNumber"),
    reraStatus: formData.get("reraStatus"),
    reraCertificateUrl: formData.get("reraCertificateUrl"),
    totalUnits: formData.get("totalUnits"),
    totalTowers: formData.get("totalTowers"),
    landAreaAcres: formData.get("landAreaAcres"),
    priceMinRupees: formData.get("priceMinRupees"),
    priceMaxRupees: formData.get("priceMaxRupees"),
    paymentPlanType: formData.get("paymentPlanType"),
    paymentPlanDescription: formData.get("paymentPlanDescription"),
    dataSource: formData.get("dataSource"),
    confidence: formData.get("confidence"),
    sourceRef: formData.get("sourceRef"),
    videoUrl: formData.get("videoUrl"),
    tour360Url: formData.get("tour360Url"),
    isPublished: formData.get("isPublished"),
    isFeatured: formData.get("isFeatured"),
    isTrending: formData.get("isTrending"),
    isLuxury: formData.get("isLuxury"),
    isAffordable: formData.get("isAffordable"),
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  });
}

export function toPaise(rupees: number | undefined): bigint | null {
  if (rupees === undefined) return null;
  return BigInt(Math.round(rupees * 100));
}

export function parseHighlights(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Reconciles the two ways a project's possession can arrive: the admin form
 * submits possessionMonth/possessionYear directly (India-localized, no
 * quarters); bulk-import CSV rows instead carry a real promisedPossession
 * date (see lib/actions/ingestion.ts) with no month/year fields to fill in.
 * Whichever side is present wins and populates the other, so
 * promisedPossession — which "possession_asc" sort and the ready/1yr/2yr/
 * later filter key off — never goes stale relative to what's displayed.
 * Only defined possessionMonth/Year takes precedence over promisedPossession
 * when a caller (or an autosave whose selects were left blank) supplies
 * neither, both come back null — a legitimate "possession not yet known"
 * state.
 */
function reconcilePossession(
  possessionMonth: number | undefined,
  possessionYear: number | undefined,
  promisedPossession: Date | undefined
): { possessionMonth: number | null; possessionYear: number | null; promisedPossession: Date | null } {
  if (possessionMonth && possessionYear) {
    return { possessionMonth, possessionYear, promisedPossession: new Date(Date.UTC(possessionYear, possessionMonth - 1, 1)) };
  }
  if (promisedPossession) {
    return { possessionMonth: promisedPossession.getUTCMonth() + 1, possessionYear: promisedPossession.getUTCFullYear(), promisedPossession };
  }
  return { possessionMonth: null, possessionYear: null, promisedPossession: null };
}

/**
 * Every field shared between create and update (everything except `slug`
 * and `cityId`, which each caller resolves differently) — one place so the
 * admin form and the bulk-import approve path (lib/actions/ingestion.ts)
 * can never drift apart on field mapping.
 */
export function buildProjectData(data: ProjectSchemaInput) {
  const possession = reconcilePossession(data.possessionMonth, data.possessionYear, data.promisedPossession);
  return {
    name: data.name,
    tagline: data.tagline ?? null,
    description: data.description ?? null,
    builderId: data.builderId || null,
    developerGroup: data.developerGroup ?? null,
    localityId: data.localityId,
    microMarketId: data.microMarketId || null,
    highlights: parseHighlights(data.highlights),
    status: data.status,
    category: data.category,
    address: data.address ?? null,
    famousLandmark: data.famousLandmark ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    googleMapsUrl: data.googleMapsUrl ?? null,
    launchDate: data.launchDate ?? null,
    promisedPossession: possession.promisedPossession,
    actualPossession: data.actualPossession ?? null,
    possessionMonth: possession.possessionMonth,
    possessionYear: possession.possessionYear,
    constructionPercent: data.constructionPercent ?? null,
    reraNumber: data.reraNumber ?? null,
    reraStatus: data.reraStatus ?? null,
    reraCertificateUrl: data.reraCertificateUrl ?? null,
    totalUnits: data.totalUnits ?? null,
    totalTowers: data.totalTowers ?? null,
    landAreaAcres: data.landAreaAcres ?? null,
    priceMinPaise: toPaise(data.priceMinRupees),
    priceMaxPaise: toPaise(data.priceMaxRupees),
    paymentPlanType: data.paymentPlanType ?? null,
    paymentPlanDescription: data.paymentPlanDescription ?? null,
    dataSource: data.dataSource,
    confidence: data.confidence,
    sourceRef: data.sourceRef ?? null,
    videoUrl: data.videoUrl ?? null,
    tour360Url: data.tour360Url ?? null,
    isPublished: data.isPublished,
    isFeatured: data.isFeatured,
    isTrending: data.isTrending,
    isLuxury: data.isLuxury,
    isAffordable: data.isAffordable,
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
  };
}

/**
 * Reads a field that exists in the Review Queue's 44-field registry and is a
 * real scalar column on Project, but is NOT part of the strict
 * ProjectImportPayload TS interface -- Phase 32's acceptEnrichmentFieldAction
 * writes these as extra untyped keys on the same staging payload object
 * (reviewFieldRegistry.ts's own established "raw untyped cast" convention;
 * see its doc comment). Returns undefined for anything that isn't a
 * non-blank string, same tolerance as every other optional field here.
 */
function readRawString(payload: unknown, key: string): string | undefined {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readRawNumber(payload: unknown, key: string): number | undefined {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Builds the exact shape buildProjectData() (above, same file) expects, from
 * a stored ProjectImportPayload. Lives here (not lib/actions/ingestion.ts,
 * where it used to be defined and stay private) because that file has a
 * `"use server"` directive, and Next.js requires every export of a
 * `"use server"` file to itself be an async Server Action -- this is a plain
 * synchronous mapper, so it belongs in this shared, non-action module
 * instead (the same reason buildProjectData/ProjectSchemaInput already live
 * here rather than in lib/actions/projects.ts).
 *
 * Phase 35 fix: 13 registry-tracked, Project-scalar fields that
 * acceptEnrichmentFieldAction can persist into the staging payload were
 * previously hardcoded to `undefined` here (or omitted outright) --
 * `applyProjectApproval` would silently discard them on approval even
 * though the founder had explicitly accepted them. Fixed below: tagline,
 * highlights, googleMapsUrl, reraCertificateUrl, paymentPlanType,
 * paymentPlanDescription, constructionPercent, landAreaAcres, videoUrl,
 * tour360Url, metaTitle, metaDescription, ogImageUrl.
 *
 * Deliberately still NOT mapped here -- not a mapping gap, a genuinely
 * separate limitation each (see Phase 35's final report):
 *  - microMarketId: the staging payload only ever holds a raw NAME string
 *    (no Phase 33-style name -> MicroMarket-id resolution exists yet) --
 *    writing it straight into the microMarketId foreign key would risk a
 *    constraint violation, the same hazard Phase 33 solved for
 *    builderId/localityId specifically, not (yet) for microMarket.
 *  - actualPossession: the Project column is a real DateTime, but the
 *    registry/Phase 32 treat this field as free text -- no adapter has ever
 *    populated it, and coercing arbitrary prose into a Date risks silent
 *    corruption rather than a fix.
 *  - amenities/specifications/documents/faqs/images: these registry fields
 *    are Prisma RELATIONS (ProjectAmenity[]/ProjectSpecification[]/
 *    ProjectDocument[]/ProjectFaq[]/ProjectImage[]), not scalar Project
 *    columns -- buildProjectData() has no mechanism to create relation
 *    rows, and building one is a real feature, not a mapping fix.
 *  - coverImage: Project has no coverImageUrl column at all (only
 *    Locality/Builder do) -- nothing exists to map it to.
 *  - brochure: Project.brochureUrl exists but is deliberately excluded from
 *    ProjectSchemaInput -- the live brochure system requires coordinated
 *    fields (version, filename, mime type, uploaded-by) a bare accepted URL
 *    can't safely populate alone.
 */
export function toProjectSchemaInput(payload: ProjectImportPayload): ProjectSchemaInput {
  const rawHighlights = (payload as unknown as Record<string, unknown>).highlights;
  const highlights = Array.isArray(rawHighlights) && rawHighlights.every((h) => typeof h === "string") ? rawHighlights.join("\n") : undefined;

  const rawPaymentPlanType = readRawString(payload, "paymentPlanType");
  const paymentPlanType = rawPaymentPlanType && (PAYMENT_PLAN_TYPES as readonly string[]).includes(rawPaymentPlanType)
    ? (rawPaymentPlanType as ProjectSchemaInput["paymentPlanType"])
    : undefined;

  return {
    name: payload.name,
    slug: undefined,
    tagline: readRawString(payload, "tagline"),
    description: payload.description,
    builderId: payload.builderId,
    developerGroup: payload.developerGroup,
    localityId: payload.localityId,
    microMarketId: undefined,
    highlights,
    status: payload.status,
    category: payload.category,
    address: payload.address,
    famousLandmark: undefined,
    latitude: payload.latitude,
    longitude: payload.longitude,
    googleMapsUrl: readRawString(payload, "googleMapsUrl"),
    launchDate: payload.launchDateIso ? new Date(payload.launchDateIso) : undefined,
    promisedPossession: payload.possessionDateIso ? new Date(payload.possessionDateIso) : undefined,
    actualPossession: undefined,
    constructionPercent: readRawNumber(payload, "constructionPercent"),
    reraNumber: payload.reraNumber,
    reraStatus: payload.reraStatus,
    reraCertificateUrl: readRawString(payload, "reraCertificateUrl"),
    totalUnits: payload.totalUnits,
    totalTowers: payload.totalTowers,
    landAreaAcres: readRawNumber(payload, "landAreaAcres"),
    priceMinRupees: payload.priceMinRupees,
    priceMaxRupees: payload.priceMaxRupees,
    paymentPlanType,
    paymentPlanDescription: readRawString(payload, "paymentPlanDescription"),
    dataSource: payload.dataSource,
    confidence: "MEDIUM",
    sourceRef: payload.sourceRef,
    videoUrl: readRawString(payload, "videoUrl"),
    tour360Url: readRawString(payload, "tour360Url"),
    // Always false, even on approval — publishing an imported record is a separate,
    // deliberate admin action, not something "approve" implies on its own.
    isPublished: false,
    isFeatured: false,
    isTrending: false,
    isLuxury: false,
    isAffordable: false,
    metaTitle: readRawString(payload, "metaTitle"),
    metaDescription: readRawString(payload, "metaDescription"),
    ogImageUrl: readRawString(payload, "ogImageUrl"),
  };
}
