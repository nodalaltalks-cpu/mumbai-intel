import { slugify } from "@/lib/slug";
import { formatDate, formatPaise } from "@/lib/format";
import { mergeLegacyPaymentPlans } from "./paymentPlanFormat";
import {
  CATEGORY_LABEL,
  POSSESSION_MONTH_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type DataSource,
  type ProjectStatus,
} from "@/lib/project-meta";
import type {
  BuilderImportPayload,
  LocalityImportPayload,
  ProjectImportPayload,
  TransactionImportPayload,
} from "./connectors/fileImport/types";

/**
 * Review Queue "data completeness" engine (Phase 14C) — reads whatever the
 * EXISTING staging payload already contains and maps it against the EXISTING
 * Project/Builder/Locality/Transaction field set. Does not read from, or
 * know about, any particular source (MagicBricks or otherwise) -- it only
 * branches on `entityType`, exactly the same dispatch the Review Queue page
 * already does for its summary card. Adding a tenth source tomorrow needs no
 * change here as long as it lands in the same ImportPayload shape every
 * other source already uses.
 */

export type FieldStatus = "RECEIVED" | "MISSING" | "NEEDS_REVIEW";

export interface ReviewField {
  key: string;
  label: string;
  status: FieldStatus;
  /** Formatted value to display; null whenever status is MISSING. */
  value: string | null;
  /** Only set for NEEDS_REVIEW fields backed by a real, existing signal (a possible-duplicate match whose value differs) -- never fabricated to fill the bucket. */
  reviewNote?: string;
}

export interface ReviewFieldGroup {
  key: string;
  label: string;
  fields: ReviewField[];
}

export interface ReviewCompleteness {
  groups: ReviewFieldGroup[];
  totalFields: number;
  receivedCount: number;
  missingCount: number;
  needsReviewCount: number;
}

/**
 * Respects the actual value's type instead of `Boolean(value)` (Phase 14C
 * Part F): 0 and false are meaningful, empty/whitespace strings are not, an
 * absent key (undefined) or explicit null is genuinely missing. Exported so
 * this exact rule is unit-testable on its own.
 */
export function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return true;
  return true;
}

function field(key: string, label: string, rawValue: unknown, displayValue: string | null, reviewNote?: string): ReviewField {
  const status: FieldStatus = reviewNote ? "NEEDS_REVIEW" : isMeaningfulValue(rawValue) ? "RECEIVED" : "MISSING";
  return { key, label, status, value: status === "MISSING" ? null : displayValue, reviewNote };
}

function summarize(groups: ReviewFieldGroup[]): ReviewCompleteness {
  const all = groups.flatMap((g) => g.fields);
  return {
    groups,
    totalFields: all.length,
    receivedCount: all.filter((f) => f.status === "RECEIVED").length,
    missingCount: all.filter((f) => f.status === "MISSING").length,
    needsReviewCount: all.filter((f) => f.status === "NEEDS_REVIEW").length,
  };
}

/** The only fields of a possible-duplicate match this UI has already fetched (see review/page.tsx's existing `matchedProjectById`) -- reused, not re-queried. */
export interface MatchedProjectSnapshot {
  name: string;
  status: ProjectStatus;
  reraNumber: string | null;
}

export interface ProjectReviewContext {
  localityName?: string;
  /** Null when this record has no possible-duplicate match (IngestStagingRecord.matchedExistingId is null) -- the normal case for a brand-new project candidate. */
  matched?: MatchedProjectSnapshot | null;
}

/**
 * Builds the full field-group breakdown for a Project staging candidate.
 * Every key here is a real `Project` model column (see prisma/schema.prisma)
 * or an existing admin-form field (see ProjectForm.tsx's own review-summary
 * panel, whose section labels this mirrors) -- nothing invented. Fields that
 * structurally don't exist on `ProjectImportPayload` today (tagline,
 * microMarketId, googleMapsUrl, reraCertificateUrl, payment plan, actual
 * possession, constructionPercent, landAreaAcres, highlights, and every
 * relation-backed field: amenities/specifications/faqs/images/documents) are
 * read via a raw untyped cast so a payload that ever DOES carry one of these
 * keys (a future source, or a future importer extension) is picked up
 * automatically -- they are not hardcoded to always read null.
 */
export function buildProjectReviewCompleteness(payload: ProjectImportPayload, context: ProjectReviewContext = {}): ReviewCompleteness {
  const raw = payload as unknown as Record<string, unknown>;
  const matched = context.matched ?? null;

  const nameReview = matched && matched.name !== payload.name ? `Possible duplicate match has a different name: "${matched.name}"` : undefined;
  const statusReview =
    matched && matched.status !== payload.status ? `Possible duplicate match has a different status: "${STATUS_LABEL[matched.status]}"` : undefined;
  const reraReview =
    matched && payload.reraNumber && matched.reraNumber && matched.reraNumber !== payload.reraNumber
      ? `Possible duplicate match has a different RERA number: "${matched.reraNumber}"`
      : undefined;
  const effectivePaymentPlans = mergeLegacyPaymentPlans(raw.paymentPlans, raw.paymentPlanType, raw.paymentPlanDescription);

  const general: ReviewFieldGroup = {
    key: "general",
    label: "General",
    fields: [
      field("name", "Name", payload.name, payload.name || null, nameReview),
      // Targeted fix (Slug editability) -- payload.slug is a founder-typed
      // override (set only via the Enrichment dialog's Edit action, see
      // applyAcceptedField.ts); absent means "not edited yet", so this keeps
      // showing the exact same auto-generated-from-name preview it always
      // has. The value shown here is the BARE slug candidate on purpose
      // (never a decorated "(auto-generated preview...)" string) -- this
      // exact value is what seeds the founder's Edit textarea, and a
      // decorative suffix baked into it would get slugified along with the
      // real value the moment they clicked Save without changing anything.
      field("slug", "Slug", payload.slug || payload.name, payload.slug || (payload.name ? slugify(payload.name) : null)),
      field("developerGroup", "Developer", payload.developerGroup, payload.developerGroup ?? null),
      field("status", "Status", payload.status, payload.status ? STATUS_LABEL[payload.status] : null, statusReview),
      field("category", "Category", payload.category, payload.category ? CATEGORY_LABEL[payload.category] : null),
      field("tagline", "Tagline", raw.tagline, typeof raw.tagline === "string" ? raw.tagline : null),
    ],
  };

  const location: ReviewFieldGroup = {
    key: "location",
    label: "Location",
    fields: [
      field("locality", "Locality", payload.localityId, context.localityName ?? null),
      field("microMarket", "Micro market", raw.microMarketId, typeof raw.microMarketId === "string" ? raw.microMarketId : null),
      field("address", "Address", payload.address, payload.address ?? null),
      field("googleMapsUrl", "Google Maps link", raw.googleMapsUrl, typeof raw.googleMapsUrl === "string" ? raw.googleMapsUrl : null),
    ],
  };

  const pricing: ReviewFieldGroup = {
    key: "pricing",
    label: "Pricing",
    fields: [
      field(
        "priceMin",
        "Starting price",
        payload.priceMinRupees,
        payload.priceMinRupees !== undefined ? formatPaise(payload.priceMinRupees * 100) : null
      ),
      field("reraNumber", "RERA number", payload.reraNumber, payload.reraNumber ?? null, reraReview),
      field(
        "reraCertificateUrl",
        "RERA certificate link",
        raw.reraCertificateUrl,
        typeof raw.reraCertificateUrl === "string" ? raw.reraCertificateUrl : null
      ),
      // Targeted fix (Payment Plan -- one clean founder field): the legacy
      // paymentPlanType/paymentPlanDescription columns and the newer
      // paymentPlans array used to show up as THREE separate, competing
      // rows here. mergeLegacyPaymentPlans folds them into ONE effective
      // list (the array when it has real entries, else the legacy pair as
      // one synthesized entry) -- never a second display of the same data,
      // and the legacy columns themselves are never touched/deleted, just
      // no longer given their own row.
      field(
        "paymentPlans",
        "Payment plan",
        effectivePaymentPlans,
        effectivePaymentPlans.length > 0 ? `${effectivePaymentPlans.length} plan(s) listed` : null
      ),
    ],
  };

  // possessionDateIso is the ONE field the staging payload carries; it maps
  // onto two Project columns (possessionMonth/possessionYear) at approval
  // time, so both rows below are derived from the same single source value,
  // not two independently-received facts.
  let possessionMonthLabel: string | null = null;
  let possessionYearLabel: string | null = null;
  if (payload.possessionDateIso) {
    const d = new Date(payload.possessionDateIso);
    if (!Number.isNaN(d.getTime())) {
      possessionMonthLabel = POSSESSION_MONTH_LABEL[d.getUTCMonth() + 1];
      possessionYearLabel = String(d.getUTCFullYear());
    }
  }

  const construction: ReviewFieldGroup = {
    key: "construction",
    label: "Construction",
    fields: [
      field("launchDate", "Launch date", payload.launchDateIso, payload.launchDateIso ? formatDate(payload.launchDateIso) : null),
      field("actualPossession", "Actual possession", raw.actualPossession, typeof raw.actualPossession === "string" ? raw.actualPossession : null),
      field("possessionMonth", "Possession month", possessionMonthLabel, possessionMonthLabel),
      field("possessionYear", "Possession year", possessionYearLabel, possessionYearLabel),
      field(
        "constructionPercent",
        "Construction completion",
        raw.constructionPercent,
        typeof raw.constructionPercent === "number" ? `${raw.constructionPercent}%` : null
      ),
      field("landAreaAcres", "Land area", raw.landAreaAcres, typeof raw.landAreaAcres === "number" ? `${raw.landAreaAcres} acres` : null),
      field("totalUnits", "Total units", payload.totalUnits, payload.totalUnits !== undefined ? String(payload.totalUnits) : null),
      field("totalTowers", "Total towers", payload.totalTowers, payload.totalTowers !== undefined ? String(payload.totalTowers) : null),
    ],
  };

  const projectInfo: ReviewFieldGroup = {
    key: "projectInfo",
    label: "Project information",
    fields: [
      field("description", "Description", payload.description, payload.description ?? null),
      field("highlights", "Highlights", raw.highlights, Array.isArray(raw.highlights) ? `${raw.highlights.length} listed` : null),
      field("specifications", "Specifications", raw.specifications, Array.isArray(raw.specifications) ? `${raw.specifications.length} listed` : null),
      field("amenities", "Amenities", raw.amenities, Array.isArray(raw.amenities) ? `${raw.amenities.length} selected` : null),
      field("faqs", "FAQs", raw.faqs, Array.isArray(raw.faqs) ? `${raw.faqs.length} listed` : null),
    ],
  };

  const media: ReviewFieldGroup = {
    key: "media",
    label: "Media",
    fields: [
      field("coverImage", "Cover image", raw.coverImageUrl, typeof raw.coverImageUrl === "string" ? raw.coverImageUrl : null),
      field("images", "Images", raw.images, Array.isArray(raw.images) ? `${raw.images.length} image(s)` : null),
      field("videoUrl", "Video URL", raw.videoUrl, typeof raw.videoUrl === "string" ? raw.videoUrl : null),
      field("tour360Url", "360° tour", raw.tour360Url, typeof raw.tour360Url === "string" ? raw.tour360Url : null),
      field("brochure", "Brochure", raw.brochureUrl, typeof raw.brochureUrl === "string" ? raw.brochureUrl : null),
      field("documents", "Documents", raw.documents, Array.isArray(raw.documents) ? `${raw.documents.length} document(s)` : null),
    ],
  };

  const seo: ReviewFieldGroup = {
    key: "seo",
    label: "SEO",
    fields: [
      field("metaTitle", "Meta title", raw.metaTitle, typeof raw.metaTitle === "string" ? raw.metaTitle : null),
      field("metaDescription", "Meta description", raw.metaDescription, typeof raw.metaDescription === "string" ? raw.metaDescription : null),
      field("ogImageUrl", "OG image URL", raw.ogImageUrl, typeof raw.ogImageUrl === "string" ? raw.ogImageUrl : null),
    ],
  };

  const source: ReviewFieldGroup = {
    key: "source",
    label: "Source",
    fields: [
      field("dataSource", "Source type", payload.dataSource, payload.dataSource ? SOURCE_LABEL[payload.dataSource as DataSource] : null),
      field("sourceRef", "Source reference", payload.sourceRef, payload.sourceRef ?? null),
    ],
  };

  return summarize([general, location, pricing, construction, projectInfo, media, seo, source]);
}

export function buildBuilderReviewCompleteness(payload: BuilderImportPayload): ReviewCompleteness {
  const group: ReviewFieldGroup = {
    key: "builder",
    label: "Builder",
    fields: [
      field("name", "Name", payload.name, payload.name || null),
      field("headquarters", "Headquarters", payload.headquarters, payload.headquarters ?? null),
      field("foundedYear", "Founded year", payload.foundedYear, payload.foundedYear !== undefined ? String(payload.foundedYear) : null),
      field("websiteUrl", "Website URL", payload.websiteUrl, payload.websiteUrl ?? null),
      field("reraNumber", "RERA number", payload.reraNumber, payload.reraNumber ?? null),
      field("description", "Description", payload.description, payload.description ?? null),
      field("logoUrl", "Logo", payload.logoUrl, payload.logoUrl ?? null),
      field("dataSource", "Source type", payload.dataSource, payload.dataSource ? SOURCE_LABEL[payload.dataSource as DataSource] : null),
      field("sourceRef", "Source reference", payload.sourceRef, payload.sourceRef ?? null),
    ],
  };
  return summarize([group]);
}

export function buildLocalityReviewCompleteness(payload: LocalityImportPayload): ReviewCompleteness {
  const group: ReviewFieldGroup = {
    key: "locality",
    label: "Locality",
    fields: [
      field("name", "Name", payload.name, payload.name || null),
      field("pincode", "Pincode", payload.pincode, payload.pincode ?? null),
      field("description", "Description", payload.description, payload.description ?? null),
      field("centroidLat", "Centroid latitude", payload.centroidLat, payload.centroidLat !== undefined ? String(payload.centroidLat) : null),
      field("centroidLng", "Centroid longitude", payload.centroidLng, payload.centroidLng !== undefined ? String(payload.centroidLng) : null),
      field(
        "avgPriceRupeesPerSqft",
        "Avg. price / sqft",
        payload.avgPriceRupeesPerSqft,
        payload.avgPriceRupeesPerSqft !== undefined ? `₹${payload.avgPriceRupeesPerSqft}/sqft` : null
      ),
      field(
        "rentalYieldPercent",
        "Rental yield",
        payload.rentalYieldPercent,
        payload.rentalYieldPercent !== undefined ? `${payload.rentalYieldPercent}%` : null
      ),
      field("connectivityNotes", "Connectivity notes", payload.connectivityNotes, payload.connectivityNotes ?? null),
      field("dataSource", "Source type", payload.dataSource, payload.dataSource ? SOURCE_LABEL[payload.dataSource as DataSource] : null),
      field("sourceRef", "Source reference", payload.sourceRef, payload.sourceRef ?? null),
    ],
  };
  return summarize([group]);
}

export interface TransactionReviewContext {
  localityName?: string;
  projectName?: string;
}

export function buildTransactionReviewCompleteness(
  payload: TransactionImportPayload,
  context: TransactionReviewContext = {}
): ReviewCompleteness {
  const group: ReviewFieldGroup = {
    key: "transaction",
    label: "Transaction",
    fields: [
      field("locality", "Locality", payload.localityId, context.localityName ?? null),
      field("project", "Project", payload.projectId, context.projectName ?? null),
      field("type", "Type", payload.type, payload.type ?? null),
      field(
        "registrationDate",
        "Registration date",
        payload.registrationDateIso,
        payload.registrationDateIso ? formatDate(payload.registrationDateIso) : null
      ),
      field("valueRupees", "Value", payload.valueRupees, payload.valueRupees !== undefined ? formatPaise(payload.valueRupees * 100) : null),
      field("carpetSqft", "Carpet area", payload.carpetSqft, payload.carpetSqft !== undefined ? `${payload.carpetSqft} sqft` : null),
      field("bedrooms", "Bedrooms", payload.bedrooms, payload.bedrooms !== undefined ? String(payload.bedrooms) : null),
      field("tower", "Tower", payload.tower, payload.tower ?? null),
      field("unitLabel", "Unit label", payload.unitLabel, payload.unitLabel ?? null),
      field("dataSource", "Source type", payload.dataSource, payload.dataSource ? SOURCE_LABEL[payload.dataSource as DataSource] : null),
      field("sourceRef", "Source reference", payload.sourceRef, payload.sourceRef ?? null),
    ],
  };
  return summarize([group]);
}

export interface InfraStagingPayloadLike {
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceRef: string;
  detail?: string;
}

export function buildInfraReviewCompleteness(payload: InfraStagingPayloadLike): ReviewCompleteness {
  const group: ReviewFieldGroup = {
    key: "infra",
    label: "Infrastructure asset",
    fields: [
      field("name", "Name", payload.name, payload.name || null),
      field("type", "Type", payload.type, payload.type || null),
      field("latitude", "Latitude", payload.latitude, payload.latitude !== undefined ? String(payload.latitude) : null),
      field("longitude", "Longitude", payload.longitude, payload.longitude !== undefined ? String(payload.longitude) : null),
      field("detail", "Detail", payload.detail, payload.detail ?? null),
      field("sourceRef", "Source reference", payload.sourceRef, payload.sourceRef ?? null),
    ],
  };
  return summarize([group]);
}
