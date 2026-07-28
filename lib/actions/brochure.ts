"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { deleteDocumentByPublicId, documentPublicIdFromUrl, uploadDocumentFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";

export interface BrochureActionState {
  error?: string;
  success?: boolean;
}

export async function uploadProjectBrochureAction(
  projectId: string,
  _prevState: BrochureActionState,
  formData: FormData
): Promise<BrochureActionState> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF file to upload" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, slug: true, brochureUrl: true },
  });
  if (!project) return { error: "Project not found" };

  let uploaded;
  try {
    uploaded = await uploadDocumentFile(file, `mumbai-intel/projects/${project.slug}/brochure`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  const previousUrl = project.brochureUrl;
  await prisma.project.update({ where: { id: projectId }, data: { brochureUrl: uploaded.url } });

  if (previousUrl) {
    const oldPublicId = documentPublicIdFromUrl(previousUrl);
    if (oldPublicId) {
      try {
        await deleteDocumentByPublicId(oldPublicId);
        await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: previousUrl, actorId: session.userId });
      } catch {
        // Best-effort — the DB row already points at the new file.
      }
    }
  }

  await emit("MediaUploaded", { entityType: "Project", entityId: projectId, url: uploaded.url, kind: "brochure", actorId: session.userId });
  return { success: true };
}

export async function removeProjectBrochureAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, brochureUrl: true },
  });
  if (!project) return { error: "Project not found" };

  if (project.brochureUrl) {
    const publicId = documentPublicIdFromUrl(project.brochureUrl);
    if (publicId) {
      try {
        await deleteDocumentByPublicId(publicId);
      } catch {
        // Continue clearing the DB reference even if the remote asset is already gone.
      }
    }
  }

  await prisma.project.update({ where: { id: projectId }, data: { brochureUrl: null } });

  if (project.brochureUrl) {
    await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: project.brochureUrl, actorId: session.userId });
  }
  return {};
}
