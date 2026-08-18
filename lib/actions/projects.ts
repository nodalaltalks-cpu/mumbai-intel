"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revalidateProject } from "@/lib/cache";
import { PROJECT_STATUSES } from "@/lib/project-meta";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import { deleteDocumentByPublicId, deleteImageByPublicId, documentPublicIdFromUrl, publicIdFromUrl } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { syncProjectNearbyInfra } from "@/lib/infra-linking";
import { buildProjectData, parseProjectForm } from "@/lib/project-data";
import { completionInputFromSchema, computeProjectCompletionPercent } from "@/lib/project-completion";
import { uploadBrochureForProject } from "./brochure";
import { addProjectImageAction } from "./images";
import { friendlyPrismaError, updateManyByRow } from "./errors";

export interface ProjectFormState {
  error?: string;
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

/**
 * Fetches everything `deleteProjectMediaAssets` needs to clean up — call
 * BEFORE deleting the Project row, since ProjectImage/ProjectDocument cascade
 * away with it (onDelete: Cascade) and would no longer be queryable after.
 */
async function fetchProjectMediaRefs(projectId: string) {
  const [images, documents, project] = await Promise.all([
    prisma.projectImage.findMany({ where: { projectId }, select: { url: true } }),
    prisma.projectDocument.findMany({ where: { projectId }, select: { url: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { brochureUrl: true } }),
  ]);
  return {
    imageUrls: images.map((i) => i.url),
    documentUrls: documents.map((d) => d.url),
    brochureUrl: project?.brochureUrl ?? null,
  };
}

/**
 * Deletes a project's remote Cloudinary assets — gallery/hero images
 * (`image` resource type), additional documents and the brochure (`raw`
 * resource type, hence the separate `deleteDocumentByPublicId` call — using
 * the image-delete API on a raw asset silently fails to remove it). Only
 * ever called AFTER the DB row is already gone, so a Cloudinary failure here
 * can never leave the database inconsistent. Each asset is deleted
 * independently and failures are logged (never thrown) so one bad asset
 * doesn't block the rest.
 */
async function deleteProjectMediaAssets(
  projectId: string,
  refs: { imageUrls: string[]; documentUrls: string[]; brochureUrl: string | null },
  actorId: string | null
): Promise<void> {
  for (const url of refs.imageUrls) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue;
    try {
      await deleteImageByPublicId(publicId);
      await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url, actorId });
    } catch (error) {
      console.error(`[projects] failed to delete Cloudinary image "${publicId}" for project ${projectId}:`, error);
    }
  }

  const documentUrls = [...refs.documentUrls, ...(refs.brochureUrl ? [refs.brochureUrl] : [])];
  for (const url of documentUrls) {
    const publicId = documentPublicIdFromUrl(url);
    if (!publicId) continue;
    try {
      await deleteDocumentByPublicId(publicId);
      await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url, actorId });
    } catch (error) {
      console.error(`[projects] failed to delete Cloudinary document "${publicId}" for project ${projectId}:`, error);
    }
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

  const requestedSlug = slugify(data.slug || data.name) || "item";
  const slug = await ensureUniqueSlug(data.slug || data.name, async (candidate) => {
    const existing = await prisma.project.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });
  const slugWarning = slug !== requestedSlug ? `Slug "${requestedSlug}" was already in use — this project was saved as "${slug}" instead.` : undefined;

  // A brand-new project can't have images yet — imageCount is always 0 here, so
  // Media (and therefore 100% overall) is only reachable after the first save.
  const completionPercent = computeProjectCompletionPercent(completionInputFromSchema(data, amenityIds.length, 0));

  let projectId: string;
  try {
    const created = await prisma.project.create({
      data: { slug, cityId: city.id, ...buildProjectData(data), completionPercent },
      select: { id: true },
    });
    projectId = created.id;
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  if (amenityIds.length > 0) await syncProjectAmenities(projectId, amenityIds);
  await syncProjectNearbyInfra(projectId);

  // Optional cover image attached directly on the New Project form — the
  // project row now exists, so it can be uploaded exactly like a normal
  // edit-page cover image upload (addProjectImageAction, kind="hero"), no
  // separate upload path. A failure here never blocks project creation
  // itself; it's surfaced as a warning on the redirect, and the admin can
  // retry from the Cover Image card on the same edit page.
  const coverImageFile = formData.get("coverImageFile");
  let coverImageWarning: string | undefined;
  if (coverImageFile instanceof File && coverImageFile.size > 0) {
    const coverImageFormData = new FormData();
    coverImageFormData.set("projectId", projectId);
    coverImageFormData.set("kind", "hero");
    coverImageFormData.set("file", coverImageFile);
    const result = await addProjectImageAction({}, coverImageFormData);
    if (result.error) coverImageWarning = result.error;
  }

  // Optional brochure attached directly on the New Project form — the project
  // row now exists, so Cloudinary/ProjectBrochureVersion have somewhere to
  // attach to. A failure here (bad file, upload hiccup) never blocks project
  // creation itself; it's surfaced as a warning on the redirect instead, and
  // the admin can retry from the BrochureUploader on the same edit page.
  const brochureFile = formData.get("brochureFile");
  let brochureWarning: string | undefined;
  if (brochureFile instanceof File && brochureFile.size > 0) {
    const result = await uploadBrochureForProject(
      { id: projectId, slug, brochureUrl: null, brochureFileName: null, brochureFileSize: null, brochureVersion: 0 },
      brochureFile,
      session.userId
    );
    if (result.error) brochureWarning = result.error;
  }

  await emit("ProjectCreated", { projectId, slug, actorId: session.userId });
  const warning = [slugWarning, coverImageWarning, brochureWarning].filter(Boolean).join(" ");
  const query = warning ? `created=1&brochureError=${encodeURIComponent(warning)}` : "created=1";
  redirect(`/admin/projects/${projectId}/edit?${query}`);
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

  const [existing, imageCount] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectImage.count({ where: { projectId } }),
  ]);
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

  const completionPercent = computeProjectCompletionPercent(completionInputFromSchema(data, amenityIds.length, imageCount));
  const nextData = { slug, ...buildProjectData(data), completionPercent };
  try {
    await prisma.project.update({
      where: { id: projectId },
      data: nextData,
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await syncProjectAmenities(projectId, amenityIds);
  await syncProjectNearbyInfra(projectId);

  await emit("ProjectUpdated", { projectId, slug, actorId: session.userId, before: existing, after: nextData });
  redirect(`/admin/projects/${projectId}/edit?saved=1`);
}

/** Silent background autosave from the edit form — same shape as updateProjectAction but no redirect. */
export async function autosaveProjectAction(projectId: string, formData: FormData): Promise<{ error?: string; savedAt?: string }> {
  await requireMutateSession();

  const parsed = parseProjectForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const [existing, imageCount] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } }),
    prisma.projectImage.count({ where: { projectId } }),
  ]);
  if (!existing) return { error: "Project not found" };

  try {
    // Reuses the exact same field set updateProjectAction writes (buildProjectData)
    // instead of a hand-maintained duplicate — a prior hand-rolled copy here had
    // drifted and silently dropped isPublished/isFeatured/dataSource/confidence
    // on every autosave, so a Publish/Featured toggle only "stuck" if the admin
    // also hit the explicit Save button before navigating away.
    await prisma.project.update({
      where: { id: projectId },
      data: {
        ...buildProjectData(data),
        completionPercent: computeProjectCompletionPercent(completionInputFromSchema(data, amenityIds.length, imageCount)),
      },
    });
    await syncProjectAmenities(projectId, amenityIds);
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return { savedAt: new Date().toISOString() };
}

/** Publish/unpublish, archive, delete, restore and every bulk action are ADMIN-only — create/edit/duplicate stay open to EDITOR. */
export async function togglePublishAction(projectId: string, nextValue: boolean): Promise<{ success?: string; error?: string }> {
  try {
    const session = await requireAdminSession();
    // Publishing resolves any pending review request — there's nothing left to review once it's live.
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { isPublished: nextValue, submittedForReviewAt: nextValue ? null : undefined },
      select: { slug: true },
    });
    if (nextValue) {
      await emit("ProjectPublished", { projectId, slug: updated.slug, actorId: session.userId });
    } else {
      await logAudit(session.userId, "project.unpublish", "Project", projectId);
      revalidateProject({ id: projectId, slug: updated.slug });
    }
    return { success: nextValue ? "Project published successfully." : "Project moved back to draft." };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Marks a draft as ready for an ADMIN to review — the Draft → Under Review step ahead of Publish. Doesn't publish anything itself. */
export async function submitForReviewAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true, isPublished: true } });
  if (!existing) return { error: "Project not found" };
  if (existing.isPublished) return { error: "This project is already published" };

  await prisma.project.update({ where: { id: projectId }, data: { submittedForReviewAt: new Date() } });
  await logAudit(session.userId, "project.submit-review", "Project", projectId);
  revalidateProject({ id: projectId, slug: existing.slug });
  return {};
}

/** Pulls a project back out of the review queue without publishing or discarding it — back to a plain Draft. */
export async function withdrawFromReviewAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  if (!existing) return { error: "Project not found" };

  await prisma.project.update({ where: { id: projectId }, data: { submittedForReviewAt: null } });
  await logAudit(session.userId, "project.withdraw-review", "Project", projectId);
  revalidateProject({ id: projectId, slug: existing.slug });
  return {};
}

export async function toggleFeaturedAction(projectId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.project.update({ where: { id: projectId }, data: { isFeatured: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "project.feature" : "project.unfeature", "Project", projectId);
  revalidateProject({ id: projectId, slug: updated.slug });
}

export async function toggleArchiveAction(projectId: string, nextValue: boolean): Promise<void> {
  const session = await requireAdminSession();
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
        famousLandmark: source.famousLandmark,
        latitude: source.latitude,
        longitude: source.longitude,
        googleMapsUrl: source.googleMapsUrl,
        launchDate: source.launchDate,
        promisedPossession: source.promisedPossession,
        possessionMonth: source.possessionMonth,
        possessionYear: source.possessionYear,
        constructionPercent: source.constructionPercent,
        totalUnits: source.totalUnits,
        totalTowers: source.totalTowers,
        landAreaAcres: source.landAreaAcres,
        priceMinPaise: source.priceMinPaise,
        priceMaxPaise: source.priceMaxPaise,
        paymentPlanType: source.paymentPlanType,
        paymentPlanDescription: source.paymentPlanDescription,
        dataSource: source.dataSource,
        confidence: source.confidence,
        videoUrl: source.videoUrl,
        tour360Url: source.tour360Url,
        isTrending: source.isTrending,
        isLuxury: source.isLuxury,
        isAffordable: source.isAffordable,
        isPublished: false,
        isFeatured: false,
        completionPercent: source.completionPercent,
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

/** Moves a project to Trash — does NOT touch the row's media or the row itself. Forces unpublished+archived so every existing public query already excludes it. */
export async function deleteProjectAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true } });
  if (!existing) return { error: "Project not found" };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await emit("ProjectDeleted", { projectId, slug: existing.slug, actorId: session.userId });
  return {};
}

/** Pulls a project back out of Trash. Stays unpublished/archived — publishing is a separate, deliberate step. */
export async function restoreProjectAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true, deletedAt: true } });
  if (!existing) return { error: "Project not found" };
  if (!existing.deletedAt) return { error: "This project isn't in Trash" };

  await prisma.project.update({ where: { id: projectId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "project.restore", "Project", projectId);
  revalidateProject({ id: projectId, slug: existing.slug });
  return {};
}

/**
 * The actual hard delete — only ever reachable from Trash. Deletes the DB
 * row first; only once that succeeds do we touch Cloudinary, so a DB failure
 * never orphans anything and a Cloudinary failure never leaves the database
 * inconsistent (the row is already gone either way).
 */
export async function permanentlyDeleteProjectAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { deletedAt: true } });
  if (!existing) return { error: "Project not found" };
  if (!existing.deletedAt) return { error: "Move this project to Trash before permanently deleting it" };

  const mediaRefs = await fetchProjectMediaRefs(projectId);

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await deleteProjectMediaAssets(projectId, mediaRefs, session.userId);

  await logAudit(session.userId, "project.permanent-delete", "Project", projectId);
  revalidateProject();
  return {};
}

export type BulkProjectOperation = "publish" | "unpublish" | "archive" | "unarchive" | "delete" | "restore" | "permanent-delete";

export async function bulkProjectAction(
  projectIds: string[],
  operation: BulkProjectOperation
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (projectIds.length === 0) return { error: "No projects selected" };

  try {
    let affected = 0;
    if (operation === "publish") {
      affected = await updateManyByRow(projectIds, (id) => prisma.project.update({ where: { id }, data: { isPublished: true } }));
    } else if (operation === "unpublish") {
      affected = await updateManyByRow(projectIds, (id) => prisma.project.update({ where: { id }, data: { isPublished: false } }));
    } else if (operation === "archive") {
      affected = await updateManyByRow(projectIds, (id) => prisma.project.update({ where: { id }, data: { isArchived: true, isPublished: false } }));
    } else if (operation === "unarchive") {
      affected = await updateManyByRow(projectIds, (id) => prisma.project.update({ where: { id }, data: { isArchived: false } }));
    } else if (operation === "delete") {
      affected = await updateManyByRow(projectIds, (id) =>
        prisma.project.update({
          where: { id },
          data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
        })
      );
    } else if (operation === "restore") {
      const trashed = await prisma.project.findMany({ where: { id: { in: projectIds }, deletedAt: { not: null } }, select: { id: true } });
      affected = await updateManyByRow(
        trashed.map((p) => p.id),
        (id) => prisma.project.update({ where: { id }, data: { deletedAt: null, deletedByUserId: null } })
      );
    } else if (operation === "permanent-delete") {
      const trashed = await prisma.project.findMany({
        where: { id: { in: projectIds }, deletedAt: { not: null } },
        select: { id: true },
      });
      for (const p of trashed) {
        const mediaRefs = await fetchProjectMediaRefs(p.id);
        await prisma.project.delete({ where: { id: p.id } });
        await deleteProjectMediaAssets(p.id, mediaRefs, session.userId);
      }
      affected = trashed.length;
    }

    await logAudit(session.userId, `project.bulk.${operation}`, "Project", projectIds.join(","));
    revalidateProject();
    return { affected };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

/** Permanently deletes everything currently in the Project Trash. */
export async function emptyProjectTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();

  const trashed = await prisma.project.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
  for (const p of trashed) {
    const mediaRefs = await fetchProjectMediaRefs(p.id);
    await prisma.project.delete({ where: { id: p.id } });
    await deleteProjectMediaAssets(p.id, mediaRefs, session.userId);
  }

  await logAudit(session.userId, "project.trash.empty", "Project", "*");
  revalidateProject();
  return { affected: trashed.length };
}
