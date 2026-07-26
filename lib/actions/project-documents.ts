"use server";

import { revalidatePath } from "next/cache";
import { requireMutateSession } from "@/lib/auth/guard";
import { deleteDocumentByPublicId, documentPublicIdFromUrl, uploadDocumentFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export interface DocumentActionState {
  error?: string;
  success?: boolean;
}

export async function addProjectDocumentAction(
  projectId: string,
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  await requireMutateSession();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF file to upload" };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, slug: true } });
  if (!project) return { error: "Project not found" };

  let uploaded;
  try {
    uploaded = await uploadDocumentFile(file, `mumbai-intel/projects/${project.slug}/documents`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  const maxSort = await prisma.projectDocument.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  await prisma.projectDocument.create({
    data: {
      projectId,
      title,
      url: uploaded.url,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return { success: true };
}

export async function deleteProjectDocumentAction(documentId: string): Promise<{ error?: string }> {
  await requireMutateSession();

  const doc = await prisma.projectDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { error: "Document not found" };

  const publicId = documentPublicIdFromUrl(doc.url);
  if (publicId) {
    try {
      await deleteDocumentByPublicId(publicId);
    } catch {
      // Continue removing the DB row even if the remote asset is already gone.
    }
  }

  await prisma.projectDocument.delete({ where: { id: documentId } });
  revalidatePath(`/admin/projects/${doc.projectId}/edit`);
  return {};
}
