"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revalidateProject } from "@/lib/cache";
import { CONFIDENCE_LEVELS, DATA_SOURCES, PROJECT_STATUSES, PROPERTY_CATEGORIES } from "@/lib/project-meta";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import { deleteImageByPublicId, publicIdFromUrl } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";

const MAX_META_TITLE = 70;
const MAX_META_DESCRIPTION = 160;

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const projectSchema = z.object({
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

export interface ProjectFormState {
  error?: string;
}

function parseProjectForm(formData: FormData) {
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

function toPaise(rupees: number | undefined): bigint | null {
  if (rupees === undefined) return null;
  return BigInt(Math.round(rupees * 100));
}

function parseHighlights(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Individual `create()` calls, not `createMany()` — the Neon HTTP adapter
 * (see lib/prisma.ts) doesn't support transactions, and Prisma's `createMany`
 * relies on one internally. Each call here is its own stateless HTTP request.
 */
async function syncProjectAmenities(projectId: string, amenityIds: string[]) {
  await prisma.projectAmenity.deleteMany({ where: { projectId } });
  const unique = Array.from(new Set(amenityIds));
  for (const amenityId of unique) {
    await prisma.projectAmenity.create({ data: { projectId, amenityId } });
  }
}

export async function createProjectAction(
  _prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const session = await requireMutateSession();

  const parsed = parseProjectForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG } });
  if (!city) return { error: "Primary city is not seeded yet" };

  const slug = await ensureUniqueSlug(data.slug || data.name, async (candidate) => {
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });

  let projectId: string;
  try {
    const created = await prisma.project.create({
      data: {
        slug,
        name: data.name,
        tagline: data.tagline ?? null,
        description: data.description ?? null,
        builderId: data.builderId || null,
        developerGroup: data.developerGroup ?? null,
        cityId: city.id,
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
      },
      select: { id: true },
    });
    projectId = created.id;
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  if (amenityIds.length > 0) await syncProjectAmenities(projectId, amenityIds);

  await logAudit(session.userId, "project.create", "Project", projectId);
  revalidateProject({ id: projectId, slug });
  redirect(`/admin/projects/${projectId}/edit?created=1`);
}

export async function updateProjectAction(
  projectId: string,
  _prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const session = await requireMutateSession();

  const parsed = parseProjectForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing) return { error: "Project not found" };

  let slug = existing.slug;
  if (data.slug) {
    const normalized = slugify(data.slug);
    if (normalized !== existing.slug) {
      const taken = await prisma.project.findFirst({
        where: { slug: normalized, NOT: { id: projectId } },
        select: { id: true },
      });
      if (taken) return { error: `Slug "${normalized}" is already in use` };
      slug = normalized;
    }
  }

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        slug,
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
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await syncProjectAmenities(projectId, amenityIds);

  await logAudit(session.userId, "project.update", "Project", projectId);
  revalidateProject({ id: projectId, slug });
  redirect(`/admin/projects/${projectId}/edit?saved=1`);
}

/** Silent background autosave from the edit form — same shape as updateProjectAction but no redirect. */
export async function autosaveProjectAction(projectId: string, formData: FormData): Promise<{ error?: string; savedAt?: string }> {
  await requireMutateSession();

  const parsed = parseProjectForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  if (!existing) return { error: "Project not found" };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name: data.name || undefined,
        tagline: data.tagline ?? null,
        description: data.description ?? null,
        builderId: data.builderId || null,
        developerGroup: data.developerGroup ?? null,
        localityId: data.localityId || undefined,
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
        sourceRef: data.sourceRef ?? null,
        videoUrl: data.videoUrl ?? null,
        tour360Url: data.tour360Url ?? null,
        isTrending: data.isTrending,
        isLuxury: data.isLuxury,
        isAffordable: data.isAffordable,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        ogImageUrl: data.ogImageUrl ?? null,
      },
    });
    await syncProjectAmenities(projectId, amenityIds);
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return { savedAt: new Date().toISOString() };
}

export async function togglePublishAction(projectId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.project.update({ where: { id: projectId }, data: { isPublished: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "project.publish" : "project.unpublish", "Project", projectId);
  revalidateProject({ id: projectId, slug: updated.slug });
}

export async function toggleFeaturedAction(projectId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.project.update({ where: { id: projectId }, data: { isFeatured: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "project.feature" : "project.unfeature", "Project", projectId);
  revalidateProject({ id: projectId, slug: updated.slug });
}

export async function toggleArchiveAction(projectId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { isArchived: nextValue, isPublished: nextValue ? false : undefined },
    select: { slug: true },
  });
  await logAudit(session.userId, nextValue ? "project.archive" : "project.unarchive", "Project", projectId);
  revalidateProject({ id: projectId, slug: updated.slug });
}

export async function updateProjectStatusAction(
  projectId: string,
  nextStatus: (typeof PROJECT_STATUSES)[number]
): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!PROJECT_STATUSES.includes(nextStatus)) return { error: "Invalid status" };
  const updated = await prisma.project.update({ where: { id: projectId }, data: { status: nextStatus }, select: { slug: true } });
  await logAudit(session.userId, "project.status.update", "Project", projectId);
  revalidateProject({ id: projectId, slug: updated.slug });
  return {};
}

export async function duplicateProjectAction(projectId: string): Promise<{ error?: string; newProjectId?: string }> {
  const session = await requireMutateSession();

  const source = await prisma.project.findUnique({
    where: { id: projectId },
    include: { configurations: true, amenities: true, specifications: true },
  });
  if (!source) return { error: "Project not found" };

  const slug = await ensureUniqueSlug(`${source.name}-copy`, async (candidate) => {
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });

  try {
    const copy = await prisma.project.create({
      data: {
        slug,
        name: `${source.name} (Copy)`,
        tagline: source.tagline,
        description: source.description,
        builderId: source.builderId,
        developerGroup: source.developerGroup,
        cityId: source.cityId,
        localityId: source.localityId,
        microMarketId: source.microMarketId,
        highlights: source.highlights,
        status: source.status,
        category: source.category,
        address: source.address,
        latitude: source.latitude,
        longitude: source.longitude,
        launchDate: source.launchDate,
        promisedPossession: source.promisedPossession,
        constructionPercent: source.constructionPercent,
        totalUnits: source.totalUnits,
        totalTowers: source.totalTowers,
        landAreaAcres: source.landAreaAcres,
        priceMinPaise: source.priceMinPaise,
        priceMaxPaise: source.priceMaxPaise,
        dataSource: source.dataSource,
        confidence: source.confidence,
        videoUrl: source.videoUrl,
        tour360Url: source.tour360Url,
        isTrending: source.isTrending,
        isLuxury: source.isLuxury,
        isAffordable: source.isAffordable,
        isPublished: false,
        isFeatured: false,
      },
      select: { id: true },
    });

    // Separate top-level calls, not a nested write — the Neon HTTP adapter
    // doesn't support transactions, and Prisma wraps nested relation writes
    // (parent + children in one create()) in one implicitly.
    for (const c of source.configurations) {
      await prisma.configuration.create({
        data: {
          projectId: copy.id,
          label: c.label,
          bedrooms: c.bedrooms,
          carpetSqft: c.carpetSqft,
          builtUpSqft: c.builtUpSqft,
          priceMinPaise: c.priceMinPaise,
          priceMaxPaise: c.priceMaxPaise,
          dataSource: c.dataSource,
          confidence: c.confidence,
          sortOrder: c.sortOrder,
        },
      });
    }
    for (const a of source.amenities) {
      await prisma.projectAmenity.create({ data: { projectId: copy.id, amenityId: a.amenityId } });
    }
    for (const s of source.specifications) {
      await prisma.projectSpecification.create({
        data: { projectId: copy.id, category: s.category, detail: s.detail, sortOrder: s.sortOrder },
      });
    }

    await logAudit(session.userId, "project.duplicate", "Project", copy.id);
    revalidateProject({ id: copy.id, slug });
    return { newProjectId: copy.id };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export async function deleteProjectAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } });

  const images = await prisma.projectImage.findMany({
    where: { projectId },
    select: { url: true },
  });

  for (const image of images) {
    const publicId = publicIdFromUrl(image.url);
    if (publicId) {
      try {
        await deleteImageByPublicId(publicId);
      } catch {
        // Best-effort — DB rows are the source of truth; a stray remote asset isn't fatal.
      }
    }
  }

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "project.delete", "Project", projectId);
  revalidateProject({ id: projectId, slug: existing?.slug });
  return {};
}

export type BulkProjectOperation = "publish" | "unpublish" | "archive" | "unarchive" | "delete";

export async function bulkProjectAction(
  projectIds: string[],
  operation: BulkProjectOperation
): Promise<{ error?: string; affected?: number }> {
  const session = await requireMutateSession();
  if (projectIds.length === 0) return { error: "No projects selected" };

  try {
    let affected = 0;
    if (operation === "publish") {
      const result = await prisma.project.updateMany({ where: { id: { in: projectIds } }, data: { isPublished: true } });
      affected = result.count;
    } else if (operation === "unpublish") {
      const result = await prisma.project.updateMany({ where: { id: { in: projectIds } }, data: { isPublished: false } });
      affected = result.count;
    } else if (operation === "archive") {
      const result = await prisma.project.updateMany({ where: { id: { in: projectIds } }, data: { isArchived: true, isPublished: false } });
      affected = result.count;
    } else if (operation === "unarchive") {
      const result = await prisma.project.updateMany({ where: { id: { in: projectIds } }, data: { isArchived: false } });
      affected = result.count;
    } else if (operation === "delete") {
      for (const id of projectIds) {
        const images = await prisma.projectImage.findMany({ where: { projectId: id }, select: { url: true } });
        for (const image of images) {
          const publicId = publicIdFromUrl(image.url);
          if (publicId) {
            try {
              await deleteImageByPublicId(publicId);
            } catch {
              // best-effort
            }
          }
        }
      }
      const result = await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      affected = result.count;
    }

    await logAudit(session.userId, `project.bulk.${operation}`, "Project", projectIds.join(","));
    revalidateProject();
    return { affected };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}
