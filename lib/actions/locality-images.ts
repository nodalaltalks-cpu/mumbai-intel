"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { deleteImageByPublicId, publicIdFromUrl, uploadImageFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";

export interface LocalityImageActionState {
  error?: string;
  success?: boolean;
  uploadedCount?: number;
}

export async function addLocalityImageAction(
  localityId: string,
  _prevState: LocalityImageActionState,
  formData: FormData
): Promise<LocalityImageActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one image file to upload" };

  const locality = await prisma.locality.findUnique({ where: { id: localityId }, select: { id: true, slug: true } });
  if (!locality) return { error: "Locality not found" };

  const maxSortOrder = await prisma.localityImage.aggregate({
    where: { localityId: locality.id },
    _max: { sortOrder: true },
  });
  let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  let uploadedCount = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const uploaded = await uploadImageFile(file, `mumbai-intel/localities/${locality.slug}`);
      await prisma.localityImage.create({
        data: { localityId: locality.id, url: uploaded.url, sortOrder: nextSortOrder },
      });
      nextSortOrder += 1;
      uploadedCount += 1;
      await emit("MediaUploaded", { entityType: "Locality", entityId: locality.id, url: uploaded.url, kind: "gallery", actorId: session.userId });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Upload failed");
    }
  }

  if (uploadedCount === 0) return { error: errors[0] ?? "Upload failed" };
  if (errors.length > 0) return { success: true, uploadedCount, error: `${errors.length} file(s) failed to upload` };
  return { success: true, uploadedCount };
}

export async function deleteLocalityImageAction(imageId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const image = await prisma.localityImage.findUnique({ where: { id: imageId } });
  if (!image) return { error: "Image not found" };

  const publicId = publicIdFromUrl(image.url);
  if (publicId) {
    try {
      await deleteImageByPublicId(publicId);
    } catch {
      // Continue removing the DB row even if the remote asset is already gone.
    }
  }

  await prisma.localityImage.delete({ where: { id: imageId } });
  await emit("MediaDeleted", { entityType: "Locality", entityId: image.localityId, url: image.url, actorId: session.userId });
  return {};
}

export async function reorderLocalityImageAction(imageId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "localities.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const image = await prisma.localityImage.findUnique({ where: { id: imageId } });
  if (!image) return { error: "Image not found" };

  const siblings = await prisma.localityImage.findMany({
    where: { localityId: image.localityId },
    orderBy: { sortOrder: "asc" },
  });
  const index = siblings.findIndex((s) => s.id === imageId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighborIndex < 0 || neighborIndex >= siblings.length) return {};

  const neighbor = siblings[neighborIndex];
  await prisma.localityImage.update({ where: { id: image.id }, data: { sortOrder: neighbor.sortOrder } });
  await prisma.localityImage.update({ where: { id: neighbor.id }, data: { sortOrder: image.sortOrder } });

  revalidatePath(`/admin/localities/${image.localityId}/edit`);
  return {};
}
