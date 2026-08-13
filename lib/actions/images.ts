"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { deleteImageByPublicId, publicIdFromUrl, uploadImageFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { IMAGE_KINDS } from "@/lib/project-meta";
import { emit } from "@/lib/events";

export interface ImageActionState {
  error?: string;
  success?: boolean;
  uploadedCount?: number;
}

// A genuinely missing FormData entry (formData.get() returning null, not just an
// empty string) hits Zod's generic "expected string, received null" type-mismatch
// instead of a real message -- same class of issue fixed for the project form's own
// schema in lib/project-data.ts.
const nullToEmptyString = (v: unknown) => (v === null || v === undefined ? "" : v);

const addImageSchema = z.object({
  projectId: z.preprocess(nullToEmptyString, z.string().min(1, "Missing project id")),
  kind: z.enum(IMAGE_KINDS),
  alt: z.string().trim().optional(),
});

export async function addProjectImageAction(
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  const session = await requireMutateSession();

  const parsed = addImageSchema.safeParse({
    projectId: formData.get("projectId"),
    kind: formData.get("kind"),
    alt: formData.get("alt") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "Choose at least one image file to upload" };
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, slug: true },
  });
  if (!project) return { error: "Project not found" };

  const maxSortOrder = await prisma.projectImage.aggregate({
    where: { projectId: project.id },
    _max: { sortOrder: true },
  });
  let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  let uploadedCount = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const uploaded = await uploadImageFile(file, `mumbai-intel/projects/${project.slug}`);
      await prisma.projectImage.create({
        data: {
          projectId: project.id,
          url: uploaded.url,
          alt: parsed.data.alt || null,
          kind: parsed.data.kind,
          sortOrder: nextSortOrder,
        },
      });
      nextSortOrder += 1;
      uploadedCount += 1;
      await emit("MediaUploaded", { entityType: "Project", entityId: project.id, url: uploaded.url, kind: parsed.data.kind, actorId: session.userId });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Upload failed");
    }
  }

  if (uploadedCount === 0) return { error: errors[0] ?? "Upload failed" };
  if (errors.length > 0) return { success: true, uploadedCount, error: `${errors.length} file(s) failed to upload` };
  return { success: true, uploadedCount };
}

/**
 * Swaps `sortOrder` with the adjacent image in the same `kind` group — two
 * independent single-row updates (no `updateMany`/transaction needed, so
 * this stays safe under the transaction-less Neon HTTP adapter).
 */
export async function reorderProjectImageAction(
  imageId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  await requireMutateSession();

  const image = await prisma.projectImage.findUnique({ where: { id: imageId } });
  if (!image) return { error: "Image not found" };

  const siblings = await prisma.projectImage.findMany({
    where: { projectId: image.projectId, kind: image.kind },
    orderBy: { sortOrder: "asc" },
  });
  const index = siblings.findIndex((s) => s.id === imageId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighborIndex < 0 || neighborIndex >= siblings.length) return {};

  const neighbor = siblings[neighborIndex];
  await prisma.projectImage.update({ where: { id: image.id }, data: { sortOrder: neighbor.sortOrder } });
  await prisma.projectImage.update({ where: { id: neighbor.id }, data: { sortOrder: image.sortOrder } });

  revalidatePath(`/admin/projects/${image.projectId}/edit`);
  revalidatePath("/");
  return {};
}

export async function deleteProjectImageAction(imageId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();

  const image = await prisma.projectImage.findUnique({
    where: { id: imageId },
    include: { project: { select: { id: true } } },
  });
  if (!image) return { error: "Image not found" };

  const publicId = publicIdFromUrl(image.url);
  if (publicId) {
    try {
      await deleteImageByPublicId(publicId);
    } catch {
      // Continue removing the DB row even if the remote asset is already gone.
    }
  }

  await prisma.projectImage.delete({ where: { id: imageId } });

  await emit("MediaDeleted", { entityType: "Project", entityId: image.project.id, url: image.url, actorId: session.userId });
  return {};
}
