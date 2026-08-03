"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revalidateBuilder } from "@/lib/cache";
import { CONFIDENCE_LEVELS, DATA_SOURCES } from "@/lib/project-meta";
import { ensureUniqueSlug, slugify } from "@/lib/slug";
import { deleteImageByPublicId, publicIdFromUrl } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { friendlyPrismaError, updateManyByRow } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const MAX_META_TITLE = 70;
const MAX_META_DESCRIPTION = 160;

const builderSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  logoUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  coverImageUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  foundedYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1800).max(2100).optional()),
  headquarters: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  websiteUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  reraNumber: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  legalNames: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  awards: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  dataSource: z.enum(DATA_SOURCES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  isPublished: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isFeatured: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  metaTitle: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_TITLE).optional()),
  metaDescription: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_DESCRIPTION).optional()),
  ogImageUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
});

export interface BuilderFormState {
  error?: string;
}

function parseBuilderForm(formData: FormData) {
  return builderSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    logoUrl: formData.get("logoUrl"),
    coverImageUrl: formData.get("coverImageUrl"),
    description: formData.get("description"),
    foundedYear: formData.get("foundedYear"),
    headquarters: formData.get("headquarters"),
    websiteUrl: formData.get("websiteUrl"),
    reraNumber: formData.get("reraNumber"),
    legalNames: formData.get("legalNames"),
    awards: formData.get("awards"),
    dataSource: formData.get("dataSource"),
    confidence: formData.get("confidence"),
    isPublished: formData.get("isPublished"),
    isFeatured: formData.get("isFeatured"),
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
  });
}

function parseLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Individual `create()` calls, not `createMany()` — same transaction-less
 * constraint as `syncProjectAmenities` in lib/actions/projects.ts.
 */
async function syncBuilderAmenities(builderId: string, amenityIds: string[]) {
  await prisma.builderAmenity.deleteMany({ where: { builderId } });
  const unique = Array.from(new Set(amenityIds));
  for (const amenityId of unique) {
    await prisma.builderAmenity.create({ data: { builderId, amenityId } });
  }
}

/**
 * Deletes a builder's remote Cloudinary assets — logo, cover image, and every
 * gallery (BuilderImage) URL. Only ever called AFTER the DB row (and its
 * cascaded BuilderImage rows) is already gone, so a Cloudinary failure here
 * can never leave the database inconsistent — the DB is already the source
 * of truth by the time this runs. Each asset is deleted independently and
 * failures are logged (never thrown) so one bad asset doesn't block the rest.
 */
async function deleteBuilderMediaAssets(
  builderId: string,
  logoUrl: string | null,
  coverImageUrl: string | null,
  galleryUrls: string[],
  actorId: string | null
): Promise<void> {
  const urls = [logoUrl, coverImageUrl, ...galleryUrls].filter((url): url is string => Boolean(url));
  for (const url of urls) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue;
    try {
      await deleteImageByPublicId(publicId);
      await emit("MediaDeleted", { entityType: "Builder", entityId: builderId, url, actorId });
    } catch (error) {
      console.error(`[builders] failed to delete Cloudinary asset "${publicId}" for builder ${builderId}:`, error);
    }
  }
}

interface BuilderCreateInput {
  name: string;
  slug?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  description?: string;
  foundedYear?: number;
  headquarters?: string;
  websiteUrl?: string;
  reraNumber?: string;
  legalNames?: string;
  awards?: string;
  dataSource: (typeof DATA_SOURCES)[number];
  confidence: (typeof CONFIDENCE_LEVELS)[number];
  isPublished: boolean;
  isFeatured: boolean;
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
}

/**
 * The one place a Builder row is actually created — used by both the full
 * "New Builder" page (createBuilderAction, every field) and the Project
 * form's inline "+ New Builder" (createBuilderInlineAction, name only, the
 * rest defaulted), so there is exactly one create-Builder code path.
 */
async function createBuilderRecord(data: BuilderCreateInput, amenityIds: string[], actorId: string): Promise<{ id: string; slug: string }> {
  const slug = await ensureUniqueSlug(data.slug || data.name, async (candidate) => {
    const existing = await prisma.builder.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });

  const created = await prisma.builder.create({
    data: {
      slug,
      name: data.name,
      logoUrl: data.logoUrl ?? null,
      coverImageUrl: data.coverImageUrl ?? null,
      description: data.description ?? null,
      foundedYear: data.foundedYear ?? null,
      headquarters: data.headquarters ?? null,
      websiteUrl: data.websiteUrl ?? null,
      reraNumber: data.reraNumber ?? null,
      legalNames: parseLines(data.legalNames),
      awards: parseLines(data.awards),
      dataSource: data.dataSource,
      confidence: data.confidence,
      isPublished: data.isPublished,
      isFeatured: data.isFeatured,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      ogImageUrl: data.ogImageUrl ?? null,
    },
    select: { id: true },
  });

  if (amenityIds.length > 0) await syncBuilderAmenities(created.id, amenityIds);

  await logAudit(actorId, "builder.create", "Builder", created.id);
  revalidateBuilder({ id: created.id, slug });
  return { id: created.id, slug };
}

export async function createBuilderAction(
  _prevState: BuilderFormState,
  formData: FormData
): Promise<BuilderFormState> {
  const session = await requireMutateSession();

  const parsed = parseBuilderForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  try {
    await createBuilderRecord(parsed.data, amenityIds, session.userId);
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  redirect("/admin/builders?created=1");
}

export interface InlineCreateResult {
  id?: string;
  name?: string;
  error?: string;
}

/** Minimal create for the Project form's inline "+ New Builder" — same shared creation path as the full form, sensible defaults for everything but name, no redirect (the Project form stays open and auto-selects the new builder). */
export async function createBuilderInlineAction(name: string): Promise<InlineCreateResult> {
  const session = await requireMutateSession();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };

  try {
    const { id } = await createBuilderRecord(
      { name: trimmed, dataSource: "MANUALLY_VERIFIED", confidence: "HIGH", isPublished: false, isFeatured: false },
      [],
      session.userId
    );
    return { id, name: trimmed };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export async function updateBuilderAction(
  builderId: string,
  _prevState: BuilderFormState,
  formData: FormData
): Promise<BuilderFormState> {
  const session = await requireMutateSession();

  const parsed = parseBuilderForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const existing = await prisma.builder.findUnique({ where: { id: builderId } });
  if (!existing) return { error: "Builder not found" };

  let slug = existing.slug;
  if (data.slug) {
    const normalized = slugify(data.slug);
    if (normalized !== existing.slug) {
      const taken = await prisma.builder.findFirst({
        where: { slug: normalized, NOT: { id: builderId } },
        select: { id: true },
      });
      if (taken) return { error: `Slug "${normalized}" is already in use` };
      slug = normalized;
    }
  }

  const nextData = {
    slug,
    name: data.name,
    logoUrl: data.logoUrl ?? null,
    coverImageUrl: data.coverImageUrl ?? null,
    description: data.description ?? null,
    foundedYear: data.foundedYear ?? null,
    headquarters: data.headquarters ?? null,
    websiteUrl: data.websiteUrl ?? null,
    reraNumber: data.reraNumber ?? null,
    legalNames: parseLines(data.legalNames),
    awards: parseLines(data.awards),
    dataSource: data.dataSource,
    confidence: data.confidence,
    isPublished: data.isPublished,
    isFeatured: data.isFeatured,
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
  };
  try {
    await prisma.builder.update({ where: { id: builderId }, data: nextData });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await syncBuilderAmenities(builderId, amenityIds);

  // Replacing a logo/cover leaves the previous Cloudinary asset orphaned
  // (unreferenced anywhere in the DB, but still live and billable) unless we
  // clean it up here — deleteBuilderMediaAssets only ever ran at trash-empty
  // time, never on a normal edit that swaps the URL.
  const replacedLogoUrl = existing.logoUrl && existing.logoUrl !== nextData.logoUrl ? existing.logoUrl : null;
  const replacedCoverUrl = existing.coverImageUrl && existing.coverImageUrl !== nextData.coverImageUrl ? existing.coverImageUrl : null;
  await deleteBuilderMediaAssets(builderId, replacedLogoUrl, replacedCoverUrl, [], session.userId);

  await emit("BuilderUpdated", { builderId, slug, actorId: session.userId, before: existing, after: nextData });
  redirect("/admin/builders?saved=1");
}

/** Moves a builder to Trash — forces unpublished+archived so every existing public query already excludes it. ADMIN-only. */
export async function deleteBuilderAction(builderId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const existing = await prisma.builder.findUnique({ where: { id: builderId }, select: { slug: true } });
  if (!existing) return { error: "Builder not found" };
  try {
    await prisma.builder.update({
      where: { id: builderId },
      data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  await logAudit(session.userId, "builder.trash", "Builder", builderId);
  revalidateBuilder({ id: builderId, slug: existing.slug });
  return {};
}

export async function restoreBuilderAction(builderId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const existing = await prisma.builder.findUnique({ where: { id: builderId }, select: { slug: true, deletedAt: true } });
  if (!existing) return { error: "Builder not found" };
  if (!existing.deletedAt) return { error: "This builder isn't in Trash" };
  await prisma.builder.update({ where: { id: builderId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "builder.restore", "Builder", builderId);
  revalidateBuilder({ id: builderId, slug: existing.slug });
  return {};
}

/**
 * The actual hard delete — only reachable from Trash. Deletes the DB row
 * first; only once that succeeds do we touch Cloudinary, so a DB failure
 * never orphans nothing (media is untouched) and a Cloudinary failure never
 * leaves the database inconsistent (the row is already gone either way).
 */
export async function permanentlyDeleteBuilderAction(builderId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const [existing, projectCount] = await Promise.all([
    prisma.builder.findUnique({
      where: { id: builderId },
      select: { deletedAt: true, logoUrl: true, coverImageUrl: true, images: { select: { url: true } } },
    }),
    prisma.project.count({ where: { builderId } }),
  ]);
  if (!existing) return { error: "Builder not found" };
  if (!existing.deletedAt) return { error: "Move this builder to Trash before permanently deleting it" };
  // Project.builderId is ON DELETE SET NULL, not RESTRICT — the delete below
  // would otherwise succeed silently and detach this builder from every
  // still-live project referencing it (unlike Locality/Transaction, which
  // are RESTRICT and would throw). Block explicitly instead, matching
  // permanentlyDeleteLocalityAction's guard.
  if (projectCount > 0) {
    return { error: `Cannot permanently delete — ${projectCount} project(s) still reference this builder.` };
  }

  try {
    await prisma.builder.delete({ where: { id: builderId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await deleteBuilderMediaAssets(builderId, existing.logoUrl, existing.coverImageUrl, existing.images.map((i) => i.url), session.userId);

  await logAudit(session.userId, "builder.permanent-delete", "Builder", builderId);
  revalidateBuilder();
  return {};
}

export async function emptyBuilderTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();

  // Project.builderId is ON DELETE SET NULL, so a bulk deleteMany would
  // otherwise silently detach still-live projects from their builder — skip
  // any trashed builder still referenced by a project, same guard as the
  // single-record permanentlyDeleteBuilderAction and the existing
  // emptyLocalityTrashAction pattern.
  const blocked = await prisma.builder.findMany({
    where: { deletedAt: { not: null }, projects: { some: {} } },
    select: { id: true },
  });
  const blockedIds = new Set(blocked.map((b) => b.id));
  const trashed = await prisma.builder.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, logoUrl: true, coverImageUrl: true, images: { select: { url: true } } },
  });
  const deletable = trashed.filter((b) => !blockedIds.has(b.id));
  if (deletable.length === 0) return { affected: 0 };

  const result = await prisma.builder.deleteMany({ where: { id: { in: deletable.map((b) => b.id) } } });

  for (const b of deletable) {
    await deleteBuilderMediaAssets(b.id, b.logoUrl, b.coverImageUrl, b.images.map((i) => i.url), session.userId);
  }

  await logAudit(session.userId, "builder.trash.empty", "Builder", deletable.map((b) => b.id).join(","));
  revalidateBuilder();
  return { affected: result.count };
}

export async function toggleBuilderPublishAction(builderId: string, nextValue: boolean): Promise<void> {
  const session = await requireAdminSession();
  const updated = await prisma.builder.update({ where: { id: builderId }, data: { isPublished: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "builder.publish" : "builder.unpublish", "Builder", builderId);
  revalidateBuilder({ id: builderId, slug: updated.slug });
}

export async function toggleBuilderFeaturedAction(builderId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.builder.update({ where: { id: builderId }, data: { isFeatured: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "builder.feature" : "builder.unfeature", "Builder", builderId);
  revalidateBuilder({ id: builderId, slug: updated.slug });
}

export async function toggleBuilderArchiveAction(builderId: string, nextValue: boolean): Promise<void> {
  const session = await requireAdminSession();
  const updated = await prisma.builder.update({
    where: { id: builderId },
    data: { isArchived: nextValue, isPublished: nextValue ? false : undefined },
    select: { slug: true },
  });
  await logAudit(session.userId, nextValue ? "builder.archive" : "builder.unarchive", "Builder", builderId);
  revalidateBuilder({ id: builderId, slug: updated.slug });
}

export async function duplicateBuilderAction(builderId: string): Promise<{ error?: string; newBuilderId?: string }> {
  const session = await requireMutateSession();

  const source = await prisma.builder.findUnique({ where: { id: builderId }, include: { amenities: true } });
  if (!source) return { error: "Builder not found" };

  const slug = await ensureUniqueSlug(`${source.name}-copy`, async (candidate) => {
    const existing = await prisma.builder.findUnique({ where: { slug: candidate } });
    return Boolean(existing);
  });

  try {
    const copy = await prisma.builder.create({
      data: {
        slug,
        name: `${source.name} (Copy)`,
        legalNames: source.legalNames,
        logoUrl: source.logoUrl,
        coverImageUrl: source.coverImageUrl,
        description: source.description,
        foundedYear: source.foundedYear,
        headquarters: source.headquarters,
        websiteUrl: source.websiteUrl,
        reraNumber: source.reraNumber,
        awards: source.awards,
        dataSource: source.dataSource,
        confidence: source.confidence,
        isPublished: false,
        isFeatured: false,
      },
      select: { id: true },
    });
    for (const a of source.amenities) {
      await prisma.builderAmenity.create({ data: { builderId: copy.id, amenityId: a.amenityId } });
    }
    await logAudit(session.userId, "builder.duplicate", "Builder", copy.id);
    revalidateBuilder({ id: copy.id, slug });
    return { newBuilderId: copy.id };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export type BulkBuilderOperation = "publish" | "unpublish" | "archive" | "unarchive" | "delete" | "restore" | "permanent-delete";

export async function bulkBuilderAction(
  builderIds: string[],
  operation: BulkBuilderOperation
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (builderIds.length === 0) return { error: "No builders selected" };

  let affected = 0;
  try {
    if (operation === "publish") {
      affected = await updateManyByRow(builderIds, (id) => prisma.builder.update({ where: { id }, data: { isPublished: true } }));
    } else if (operation === "unpublish") {
      affected = await updateManyByRow(builderIds, (id) => prisma.builder.update({ where: { id }, data: { isPublished: false } }));
    } else if (operation === "archive") {
      affected = await updateManyByRow(builderIds, (id) => prisma.builder.update({ where: { id }, data: { isArchived: true, isPublished: false } }));
    } else if (operation === "unarchive") {
      affected = await updateManyByRow(builderIds, (id) => prisma.builder.update({ where: { id }, data: { isArchived: false } }));
    } else if (operation === "delete") {
      affected = await updateManyByRow(builderIds, (id) =>
        prisma.builder.update({
          where: { id },
          data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
        })
      );
    } else if (operation === "restore") {
      const trashed = await prisma.builder.findMany({ where: { id: { in: builderIds }, deletedAt: { not: null } }, select: { id: true } });
      affected = await updateManyByRow(
        trashed.map((b) => b.id),
        (id) => prisma.builder.update({ where: { id }, data: { deletedAt: null, deletedByUserId: null } })
      );
    } else if (operation === "permanent-delete") {
      const trashed = await prisma.builder.findMany({
        where: { id: { in: builderIds }, deletedAt: { not: null } },
        select: { id: true, logoUrl: true, coverImageUrl: true, images: { select: { url: true } } },
      });
      for (const b of trashed) {
        await prisma.builder.delete({ where: { id: b.id } });
        await deleteBuilderMediaAssets(b.id, b.logoUrl, b.coverImageUrl, b.images.map((i) => i.url), session.userId);
      }
      affected = trashed.length;
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, `builder.bulk.${operation}`, "Builder", builderIds.join(","));
  revalidateBuilder();
  return { affected };
}

// ── Timeline events ──────────────────────────────────────────────────────

const timelineSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  title: z.string().trim().min(1, "Title is required"),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export async function addBuilderTimelineEventAction(
  builderId: string,
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireMutateSession();

  const parsed = timelineSchema.safeParse({
    year: formData.get("year"),
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.builderTimelineEvent.aggregate({
    where: { builderId },
    _max: { sortOrder: true },
  });

  const event = await prisma.builderTimelineEvent.create({
    data: {
      builderId,
      year: parsed.data.year,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit(session.userId, "builder.timeline.add", "BuilderTimelineEvent", event.id);
  const builder = await prisma.builder.findUnique({ where: { id: builderId }, select: { slug: true } });
  revalidateBuilder({ id: builderId, slug: builder?.slug });
  return {};
}

export async function deleteBuilderTimelineEventAction(eventId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  const event = await prisma.builderTimelineEvent.delete({ where: { id: eventId } });
  await logAudit(session.userId, "builder.timeline.delete", "BuilderTimelineEvent", eventId);
  const builder = await prisma.builder.findUnique({ where: { id: event.builderId }, select: { slug: true } });
  revalidateBuilder({ id: event.builderId, slug: builder?.slug });
  return {};
}

// ── Trust score snapshots ───────────────────────────────────────────────

const scoreSchema = z.object({
  asOf: z.coerce.date(),
  overallScore: z.coerce.number().min(0).max(10),
  onTimeDeliveryPct: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
  avgDelayMonths: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  deliveredProjects: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  activeProjects: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  litigationFlags: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
  methodologyVersion: z.string().trim().min(1, "Methodology version is required"),
});

export async function addBuilderScoreSnapshotAction(
  builderId: string,
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireMutateSession();

  const parsed = scoreSchema.safeParse({
    asOf: formData.get("asOf"),
    overallScore: formData.get("overallScore"),
    onTimeDeliveryPct: formData.get("onTimeDeliveryPct"),
    avgDelayMonths: formData.get("avgDelayMonths"),
    deliveredProjects: formData.get("deliveredProjects"),
    activeProjects: formData.get("activeProjects"),
    litigationFlags: formData.get("litigationFlags"),
    methodologyVersion: formData.get("methodologyVersion"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  try {
    const snapshot = await prisma.builderScoreSnapshot.create({
      data: {
        builderId,
        asOf: data.asOf,
        overallScore: data.overallScore,
        onTimeDeliveryPct: data.onTimeDeliveryPct ?? null,
        avgDelayMonths: data.avgDelayMonths ?? null,
        deliveredProjects: data.deliveredProjects ?? 0,
        activeProjects: data.activeProjects ?? 0,
        litigationFlags: data.litigationFlags ?? 0,
        methodologyVersion: data.methodologyVersion,
        dataSource: "MANUALLY_VERIFIED",
      },
    });
    await logAudit(session.userId, "builder.score.add", "BuilderScoreSnapshot", snapshot.id);
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  const builder = await prisma.builder.findUnique({ where: { id: builderId }, select: { slug: true } });
  revalidateBuilder({ id: builderId, slug: builder?.slug });
  return {};
}

export async function deleteBuilderScoreSnapshotAction(snapshotId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  const snapshot = await prisma.builderScoreSnapshot.delete({ where: { id: snapshotId } });
  await logAudit(session.userId, "builder.score.delete", "BuilderScoreSnapshot", snapshotId);
  const builder = await prisma.builder.findUnique({ where: { id: snapshot.builderId }, select: { slug: true } });
  revalidateBuilder({ id: snapshot.builderId, slug: builder?.slug });
  return {};
}
