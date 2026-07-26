"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession } from "@/lib/auth/guard";
import { deleteImageByPublicId, publicIdFromUrl, uploadImageFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export interface BuilderImageActionState {
  error?: string;
  success?: boolean;
  uploadedCount?: number;
}

export async function addBuilderImageAction(
  builderId: string,
  _prevState: BuilderImageActionState,
  formData: FormData
): Promise<BuilderImageActionState> {
  await requireMutateSession();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one image file to upload" };

  const builder = await prisma.builder.findUnique({ where: { id: builderId }, select: { id: true, slug: true } });
  if (!builder) return { error: "Builder not found" };

  const maxSortOrder = await prisma.builderImage.aggregate({
    where: { builderId: builder.id },
    _max: { sortOrder: true },
  });
  let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  let uploadedCount = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const uploaded = await uploadImageFile(file, `mumbai-intel/builders/${builder.slug}`);
      await prisma.builderImage.create({
        data: { builderId: builder.id, url: uploaded.url, sortOrder: nextSortOrder },
      });
      nextSortOrder += 1;
      uploadedCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Upload failed");
    }
  }

  revalidatePath(`/admin/builders/${builder.id}/edit`);
  revalidatePath("/");

  if (uploadedCount === 0) return { error: errors[0] ?? "Upload failed" };
  if (errors.length > 0) return { success: true, uploadedCount, error: `${errors.length} file(s) failed to upload` };
  return { success: true, uploadedCount };
}

export async function deleteBuilderImageAction(imageId: string): Promise<{ error?: string }> {
  await requireMutateSession();

  const image = await prisma.builderImage.findUnique({ where: { id: imageId } });
  if (!image) return { error: "Image not found" };

  const publicId = publicIdFromUrl(image.url);
  if (publicId) {
    try {
      await deleteImageByPublicId(publicId);
    } catch {
      // Continue removing the DB row even if the remote asset is already gone.
    }
  }

  await prisma.builderImage.delete({ where: { id: imageId } });
  revalidatePath(`/admin/builders/${image.builderId}/edit`);
  return {};
}

export async function reorderBuilderImageAction(imageId: string, direction: "up" | "down"): Promise<{ error?: string }> {
  await requireMutateSession();

  const image = await prisma.builderImage.findUnique({ where: { id: imageId } });
  if (!image) return { error: "Image not found" };

  const siblings = await prisma.builderImage.findMany({
    where: { builderId: image.builderId },
    orderBy: { sortOrder: "asc" },
  });
  const index = siblings.findIndex((s) => s.id === imageId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighborIndex < 0 || neighborIndex >= siblings.length) return {};

  const neighbor = siblings[neighborIndex];
  await prisma.builderImage.update({ where: { id: image.id }, data: { sortOrder: neighbor.sortOrder } });
  await prisma.builderImage.update({ where: { id: neighbor.id }, data: { sortOrder: image.sortOrder } });

  revalidatePath(`/admin/builders/${image.builderId}/edit`);
  return {};
}
