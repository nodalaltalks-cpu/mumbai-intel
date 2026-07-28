import "server-only";
import { z } from "zod";
import { CONFIDENCE_LEVELS, DATA_SOURCES, PROJECT_STATUSES, PROPERTY_CATEGORIES } from "@/lib/project-meta";

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

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  tagline: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  builderId: z.preprocess(emptyToUndefined, z.string().optional()),
  developerGroup: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  localityId: z.string().min(1, "Locality is required"),
  microMarketId: z.preprocess(emptyToUndefined, z.string().optional()),
  highlights: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.enum(PROJECT_STATUSES),
  category: z.enum(PROPERTY_CATEGORIES),
  address: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  latitude: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  longitude: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  launchDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  promisedPossession: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  actualPossession: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  constructionPercent: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  reraNumber: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  reraStatus: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  totalUnits: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  totalTowers: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  landAreaAcres: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  priceMinRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  priceMaxRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  dataSource: z.enum(DATA_SOURCES),
  confidence: z.enum(CONFIDENCE_LEVELS),
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
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    launchDate: formData.get("launchDate"),
    promisedPossession: formData.get("promisedPossession"),
    actualPossession: formData.get("actualPossession"),
    constructionPercent: formData.get("constructionPercent"),
    reraNumber: formData.get("reraNumber"),
    reraStatus: formData.get("reraStatus"),
    totalUnits: formData.get("totalUnits"),
    totalTowers: formData.get("totalTowers"),
    landAreaAcres: formData.get("landAreaAcres"),
    priceMinRupees: formData.get("priceMinRupees"),
    priceMaxRupees: formData.get("priceMaxRupees"),
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
 * Every field shared between create and update (everything except `slug`
 * and `cityId`, which each caller resolves differently) — one place so the
 * admin form and the bulk-import approve path (lib/actions/ingestion.ts)
 * can never drift apart on field mapping.
 */
export function buildProjectData(data: ProjectSchemaInput) {
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
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    launchDate: data.launchDate ?? null,
    promisedPossession: data.promisedPossession ?? null,
    actualPossession: data.actualPossession ?? null,
    constructionPercent: data.constructionPercent ?? null,
    reraNumber: data.reraNumber ?? null,
    reraStatus: data.reraStatus ?? null,
    totalUnits: data.totalUnits ?? null,
    totalTowers: data.totalTowers ?? null,
    landAreaAcres: data.landAreaAcres ?? null,
    priceMinPaise: toPaise(data.priceMinRupees),
    priceMaxPaise: toPaise(data.priceMaxRupees),
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
