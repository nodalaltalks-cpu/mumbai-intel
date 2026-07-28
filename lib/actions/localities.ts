"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revalidateLocality } from "@/lib/cache";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { slugify } from "@/lib/slug";
import { deleteImageByPublicId, publicIdFromUrl } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
const MAX_META_TITLE = 70;
const MAX_META_DESCRIPTION = 160;

const localitySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  zoneId: z.preprocess(emptyToUndefined, z.string().optional()),
  pincode: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  coverImageUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  centroidLat: z.preprocess(emptyToUndefined, z.coerce.number().min(-90).max(90).optional()),
  centroidLng: z.preprocess(emptyToUndefined, z.coerce.number().min(-180).max(180).optional()),
  avgPriceRupeesPerSqft: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  rentalYieldPercent: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(100).optional()),
  growthPercentYoy: z.preprocess(emptyToUndefined, z.coerce.number().min(-100).max(1000).optional()),
  connectivityNotes: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  investmentScore: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(10).optional()),
  endUserScore: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(10).optional()),
  luxuryScore: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(10).optional()),
  familyScore: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(10).optional()),
  advantages: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  disadvantages: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  metaTitle: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_TITLE).optional()),
  metaDescription: z.preprocess(emptyToUndefined, z.string().trim().max(MAX_META_DESCRIPTION).optional()),
  canonicalUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  ogImageUrl: z.preprocess(emptyToUndefined, z.string().trim().url("Enter a valid URL").optional()),
  isPublished: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  isFeatured: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export interface LocalityFormState {
  error?: string;
}

function parseLocalityForm(formData: FormData) {
  return localitySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    zoneId: formData.get("zoneId"),
    pincode: formData.get("pincode"),
    description: formData.get("description"),
    coverImageUrl: formData.get("coverImageUrl"),
    centroidLat: formData.get("centroidLat"),
    centroidLng: formData.get("centroidLng"),
    avgPriceRupeesPerSqft: formData.get("avgPriceRupeesPerSqft"),
    rentalYieldPercent: formData.get("rentalYieldPercent"),
    growthPercentYoy: formData.get("growthPercentYoy"),
    connectivityNotes: formData.get("connectivityNotes"),
    investmentScore: formData.get("investmentScore"),
    endUserScore: formData.get("endUserScore"),
    luxuryScore: formData.get("luxuryScore"),
    familyScore: formData.get("familyScore"),
    advantages: formData.get("advantages"),
    disadvantages: formData.get("disadvantages"),
    metaTitle: formData.get("metaTitle"),
    metaDescription: formData.get("metaDescription"),
    canonicalUrl: formData.get("canonicalUrl"),
    ogImageUrl: formData.get("ogImageUrl"),
    isPublished: formData.get("isPublished"),
    isFeatured: formData.get("isFeatured"),
  });
}

function parseLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Same transaction-less constraint as syncProjectAmenities / syncBuilderAmenities. */
async function syncLocalityAmenities(localityId: string, amenityIds: string[]) {
  await prisma.localityAmenity.deleteMany({ where: { localityId } });
  const unique = Array.from(new Set(amenityIds));
  for (const amenityId of unique) {
    await prisma.localityAmenity.create({ data: { localityId, amenityId } });
  }
}

async function uniqueLocalitySlug(cityId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "locality";
  let candidate = root;
  let attempt = 1;
  for (;;) {
    const existing = await prisma.locality.findFirst({
      where: { cityId, slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${root}-${attempt}`;
  }
}

function marketFieldsPresent(data: z.infer<typeof localitySchema>): boolean {
  return data.avgPriceRupeesPerSqft !== undefined || data.rentalYieldPercent !== undefined || data.growthPercentYoy !== undefined;
}

/**
 * Fetches everything `deleteLocalityMediaAssets` needs — call BEFORE
 * deleting the Locality row, since LocalityImage cascades away with it
 * (onDelete: Cascade) and would no longer be queryable after.
 */
async function fetchLocalityMediaRefs(localityId: string) {
  const [locality, images] = await Promise.all([
    prisma.locality.findUnique({ where: { id: localityId }, select: { coverImageUrl: true } }),
    prisma.localityImage.findMany({ where: { localityId }, select: { url: true } }),
  ]);
  return { coverImageUrl: locality?.coverImageUrl ?? null, galleryUrls: images.map((i) => i.url) };
}

/**
 * Deletes a locality's remote Cloudinary assets — cover image and gallery.
 * Only ever called AFTER the DB row is already gone, so a Cloudinary
 * failure here can never leave the database inconsistent. Each asset is
 * deleted independently and failures are logged (never thrown) so one bad
 * asset doesn't block the rest.
 */
async function deleteLocalityMediaAssets(
  localityId: string,
  refs: { coverImageUrl: string | null; galleryUrls: string[] },
  actorId: string | null
): Promise<void> {
  const urls = [refs.coverImageUrl, ...refs.galleryUrls].filter((url): url is string => Boolean(url));
  for (const url of urls) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue;
    try {
      await deleteImageByPublicId(publicId);
      await emit("MediaDeleted", { entityType: "Locality", entityId: localityId, url, actorId });
    } catch (error) {
      console.error(`[localities] failed to delete Cloudinary asset "${publicId}" for locality ${localityId}:`, error);
    }
  }
}

export async function createLocalityAction(
  _prevState: LocalityFormState,
  formData: FormData
): Promise<LocalityFormState> {
  const session = await requireMutateSession();

  const parsed = parseLocalityForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG } });
  if (!city) return { error: "Primary city is not seeded yet" };

  const slug = await uniqueLocalitySlug(city.id, data.slug || data.name);
  const hasMarketData = marketFieldsPresent(data);

  let localityId: string;
  try {
    const created = await prisma.locality.create({
      data: {
        cityId: city.id,
        zoneId: data.zoneId || null,
        name: data.name,
        slug,
        pincode: data.pincode ?? null,
        description: data.description ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        centroidLat: data.centroidLat ?? null,
        centroidLng: data.centroidLng ?? null,
        avgPricePerSqftPaise: data.avgPriceRupeesPerSqft !== undefined ? BigInt(Math.round(data.avgPriceRupeesPerSqft * 100)) : null,
        rentalYieldPercent: data.rentalYieldPercent ?? null,
        growthPercentYoy: data.growthPercentYoy ?? null,
        marketDataSource: hasMarketData ? "MANUALLY_VERIFIED" : null,
        marketAsOf: hasMarketData ? new Date() : null,
        connectivityNotes: data.connectivityNotes ?? null,
        investmentScore: data.investmentScore ?? null,
        endUserScore: data.endUserScore ?? null,
        luxuryScore: data.luxuryScore ?? null,
        familyScore: data.familyScore ?? null,
        advantages: parseLines(data.advantages),
        disadvantages: parseLines(data.disadvantages),
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        canonicalUrl: data.canonicalUrl ?? null,
        ogImageUrl: data.ogImageUrl ?? null,
        isPublished: data.isPublished,
        isFeatured: data.isFeatured,
      },
      select: { id: true },
    });
    localityId = created.id;
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  if (amenityIds.length > 0) await syncLocalityAmenities(localityId, amenityIds);

  await logAudit(session.userId, "locality.create", "Locality", localityId);
  revalidateLocality({ id: localityId, slug });
  redirect("/admin/localities?created=1");
}

export async function updateLocalityAction(
  localityId: string,
  _prevState: LocalityFormState,
  formData: FormData
): Promise<LocalityFormState> {
  const session = await requireMutateSession();

  const parsed = parseLocalityForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const amenityIds = formData.getAll("amenityIds").map(String).filter(Boolean);

  const existing = await prisma.locality.findUnique({ where: { id: localityId } });
  if (!existing) return { error: "Locality not found" };

  let slug = existing.slug;
  if (data.slug) {
    const normalized = slugify(data.slug);
    if (normalized !== existing.slug) {
      slug = await uniqueLocalitySlug(existing.cityId, normalized, localityId);
    }
  }

  const hasMarketData = marketFieldsPresent(data);

  const nextData = {
    zoneId: data.zoneId || null,
    name: data.name,
    slug,
    pincode: data.pincode ?? null,
    description: data.description ?? null,
    coverImageUrl: data.coverImageUrl ?? null,
    centroidLat: data.centroidLat ?? null,
    centroidLng: data.centroidLng ?? null,
    avgPricePerSqftPaise: data.avgPriceRupeesPerSqft !== undefined ? BigInt(Math.round(data.avgPriceRupeesPerSqft * 100)) : null,
    rentalYieldPercent: data.rentalYieldPercent ?? null,
    growthPercentYoy: data.growthPercentYoy ?? null,
    marketDataSource: hasMarketData ? ("MANUALLY_VERIFIED" as const) : null,
    marketAsOf: hasMarketData ? new Date() : null,
    connectivityNotes: data.connectivityNotes ?? null,
    investmentScore: data.investmentScore ?? null,
    endUserScore: data.endUserScore ?? null,
    luxuryScore: data.luxuryScore ?? null,
    familyScore: data.familyScore ?? null,
    advantages: parseLines(data.advantages),
    disadvantages: parseLines(data.disadvantages),
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    canonicalUrl: data.canonicalUrl ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
    isPublished: data.isPublished,
    isFeatured: data.isFeatured,
  };

  try {
    await prisma.locality.update({ where: { id: localityId }, data: nextData });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await syncLocalityAmenities(localityId, amenityIds);

  await logAudit(session.userId, "locality.update", "Locality", localityId, { before: existing, after: nextData });
  revalidateLocality({ id: localityId, slug });
  redirect("/admin/localities?saved=1");
}

export interface DeleteLocalityResult {
  error?: string;
}

export async function deleteLocalityAction(localityId: string): Promise<DeleteLocalityResult> {
  const session = await requireAdminSession();

  const existing = await prisma.locality.findUnique({ where: { id: localityId }, select: { slug: true } });
  if (!existing) return { error: "Locality not found" };

  await prisma.locality.update({
    where: { id: localityId },
    data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
  });
  await logAudit(session.userId, "locality.trash", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: existing.slug });
  return {};
}

export async function restoreLocalityAction(localityId: string): Promise<DeleteLocalityResult> {
  const session = await requireAdminSession();

  const existing = await prisma.locality.findUnique({ where: { id: localityId }, select: { slug: true } });
  if (!existing) return { error: "Locality not found" };

  await prisma.locality.update({ where: { id: localityId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "locality.restore", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: existing.slug });
  return {};
}

export async function permanentlyDeleteLocalityAction(localityId: string): Promise<DeleteLocalityResult> {
  const session = await requireAdminSession();

  const [projectCount, transactionCount, existing] = await Promise.all([
    prisma.project.count({ where: { localityId } }),
    prisma.transaction.count({ where: { localityId } }),
    prisma.locality.findUnique({ where: { id: localityId }, select: { slug: true, deletedAt: true } }),
  ]);

  if (!existing) return { error: "Locality not found" };
  if (!existing.deletedAt) return { error: "Move this locality to Trash before permanently deleting it" };
  if (projectCount > 0 || transactionCount > 0) {
    return {
      error: `Cannot permanently delete — ${projectCount} project(s) and ${transactionCount} transaction(s) still reference this locality.`,
    };
  }

  const mediaRefs = await fetchLocalityMediaRefs(localityId);

  await prisma.locality.delete({ where: { id: localityId } });

  await deleteLocalityMediaAssets(localityId, mediaRefs, session.userId);

  await logAudit(session.userId, "locality.permanent-delete", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: existing.slug });
  return {};
}

export async function emptyLocalityTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();

  const blocked = await prisma.locality.findMany({
    where: { deletedAt: { not: null }, OR: [{ projects: { some: {} } }, { transactions: { some: {} } }] },
    select: { id: true },
  });
  const blockedIds = new Set(blocked.map((b) => b.id));
  const deletable = await prisma.locality.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
  const ids = deletable.map((d) => d.id).filter((id) => !blockedIds.has(id));
  if (ids.length === 0) return { affected: 0 };

  const mediaRefsById = new Map(await Promise.all(ids.map(async (id) => [id, await fetchLocalityMediaRefs(id)] as const)));

  const result = await prisma.locality.deleteMany({ where: { id: { in: ids } } });

  for (const id of ids) {
    const refs = mediaRefsById.get(id);
    if (refs) await deleteLocalityMediaAssets(id, refs, session.userId);
  }

  await logAudit(session.userId, "locality.trash.empty", "Locality", ids.join(","));
  revalidateLocality();
  return { affected: result.count };
}

export async function toggleLocalityPublishAction(localityId: string, nextValue: boolean): Promise<void> {
  const session = await requireAdminSession();
  const updated = await prisma.locality.update({ where: { id: localityId }, data: { isPublished: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "locality.publish" : "locality.unpublish", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: updated.slug });
}

export async function toggleLocalityFeaturedAction(localityId: string, nextValue: boolean): Promise<void> {
  const session = await requireMutateSession();
  const updated = await prisma.locality.update({ where: { id: localityId }, data: { isFeatured: nextValue }, select: { slug: true } });
  await logAudit(session.userId, nextValue ? "locality.feature" : "locality.unfeature", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: updated.slug });
}

export async function toggleLocalityArchiveAction(localityId: string, nextValue: boolean): Promise<void> {
  const session = await requireAdminSession();
  const updated = await prisma.locality.update({
    where: { id: localityId },
    data: { isArchived: nextValue, isPublished: nextValue ? false : undefined },
    select: { slug: true },
  });
  await logAudit(session.userId, nextValue ? "locality.archive" : "locality.unarchive", "Locality", localityId);
  revalidateLocality({ id: localityId, slug: updated.slug });
}

export async function duplicateLocalityAction(localityId: string): Promise<{ error?: string; newLocalityId?: string }> {
  const session = await requireMutateSession();

  const source = await prisma.locality.findUnique({ where: { id: localityId }, include: { amenities: true } });
  if (!source) return { error: "Locality not found" };

  const slug = await uniqueLocalitySlug(source.cityId, `${source.name}-copy`);

  try {
    const copy = await prisma.locality.create({
      data: {
        cityId: source.cityId,
        zoneId: source.zoneId,
        name: `${source.name} (Copy)`,
        slug,
        pincode: source.pincode,
        description: source.description,
        coverImageUrl: source.coverImageUrl,
        centroidLat: source.centroidLat,
        centroidLng: source.centroidLng,
        avgPricePerSqftPaise: source.avgPricePerSqftPaise,
        rentalYieldPercent: source.rentalYieldPercent,
        growthPercentYoy: source.growthPercentYoy,
        marketDataSource: source.marketDataSource,
        marketAsOf: source.marketAsOf,
        connectivityNotes: source.connectivityNotes,
        investmentScore: source.investmentScore,
        endUserScore: source.endUserScore,
        luxuryScore: source.luxuryScore,
        familyScore: source.familyScore,
        advantages: source.advantages,
        disadvantages: source.disadvantages,
        isPublished: false,
        isFeatured: false,
      },
      select: { id: true },
    });
    for (const a of source.amenities) {
      await prisma.localityAmenity.create({ data: { localityId: copy.id, amenityId: a.amenityId } });
    }
    await logAudit(session.userId, "locality.duplicate", "Locality", copy.id);
    revalidateLocality({ id: copy.id, slug });
    return { newLocalityId: copy.id };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export type BulkLocalityOperation = "publish" | "unpublish" | "archive" | "unarchive" | "delete" | "restore" | "permanent-delete";

export async function bulkLocalityAction(
  localityIds: string[],
  operation: BulkLocalityOperation
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (localityIds.length === 0) return { error: "No localities selected" };

  let affected = 0;
  try {
    if (operation === "publish") {
      affected = (await prisma.locality.updateMany({ where: { id: { in: localityIds } }, data: { isPublished: true } })).count;
    } else if (operation === "unpublish") {
      affected = (await prisma.locality.updateMany({ where: { id: { in: localityIds } }, data: { isPublished: false } })).count;
    } else if (operation === "archive") {
      affected = (await prisma.locality.updateMany({ where: { id: { in: localityIds } }, data: { isArchived: true, isPublished: false } })).count;
    } else if (operation === "unarchive") {
      affected = (await prisma.locality.updateMany({ where: { id: { in: localityIds } }, data: { isArchived: false } })).count;
    } else if (operation === "delete") {
      affected = (
        await prisma.locality.updateMany({
          where: { id: { in: localityIds } },
          data: { deletedAt: new Date(), deletedByUserId: session.userId, isPublished: false, isArchived: true },
        })
      ).count;
    } else if (operation === "restore") {
      affected = (
        await prisma.locality.updateMany({ where: { id: { in: localityIds } }, data: { deletedAt: null, deletedByUserId: null } })
      ).count;
    } else if (operation === "permanent-delete") {
      const blocked = await prisma.locality.findMany({
        where: { id: { in: localityIds }, OR: [{ projects: { some: {} } }, { transactions: { some: {} } }] },
        select: { id: true },
      });
      const blockedIds = new Set(blocked.map((b) => b.id));
      const deletable = localityIds.filter((id) => !blockedIds.has(id));
      if (deletable.length === 0) return { error: "Selected localities are still referenced by projects or transactions" };

      const mediaRefsById = new Map(await Promise.all(deletable.map(async (id) => [id, await fetchLocalityMediaRefs(id)] as const)));

      const result = await prisma.locality.deleteMany({ where: { id: { in: deletable }, deletedAt: { not: null } } });

      for (const id of deletable) {
        const refs = mediaRefsById.get(id);
        if (refs) await deleteLocalityMediaAssets(id, refs, session.userId);
      }

      affected = result.count;
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, `locality.bulk.${operation}`, "Locality", localityIds.join(","));
  revalidateLocality();
  return { affected };
}
