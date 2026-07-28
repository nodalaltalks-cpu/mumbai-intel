"use server";

import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { deleteDocumentByPublicId, documentPublicIdFromUrl, uploadDocumentFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { logAudit } from "@/lib/audit";
import { revalidateProject } from "@/lib/cache";

export interface BrochureActionState {
  error?: string;
  success?: boolean;
}

/** Env-configurable per the brochure spec — falls back to 15MB if unset. */
const BROCHURE_MAX_BYTES = Number(process.env.BROCHURE_MAX_SIZE_MB || 15) * 1024 * 1024;

/**
 * Upload or replace the current brochure. Every call creates a new
 * ProjectBrochureVersion row (the version history) and repoints Project's
 * "current brochure" fields at it — the PREVIOUS version's Cloudinary file
 * is deliberately left alone (not deleted), so its history row keeps working
 * even after a replace. Only removeProjectBrochureAction ever deletes a file.
 */
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
  if (file.type !== "application/pdf") {
    return { error: "Only PDF files are allowed" };
  }
  if (file.size > BROCHURE_MAX_BYTES) {
    return { error: `File is too large. Maximum size is ${Math.round(BROCHURE_MAX_BYTES / (1024 * 1024))}MB.` };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      slug: true,
      brochureUrl: true,
      brochureFileName: true,
      brochureFileSize: true,
      brochureVersion: true,
    },
  });
  if (!project) return { error: "Project not found" };

  const nextVersion = project.brochureVersion + 1;
  const isReplace = project.brochureUrl !== null;

  let uploaded;
  try {
    uploaded = await uploadDocumentFile(file, `mumbai-intel/projects/${project.slug}/brochure-v${nextVersion}`, BROCHURE_MAX_BYTES);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  await prisma.projectBrochureVersion.create({
    data: {
      projectId,
      version: nextVersion,
      url: uploaded.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadedByUserId: session.userId,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      brochureUrl: uploaded.url,
      brochureFileName: file.name,
      brochureFileSize: file.size,
      brochureMimeType: file.type,
      brochureUploadedAt: new Date(),
      brochureUploadedBy: session.userId,
      brochureVersion: nextVersion,
    },
  });

  await logAudit(session.userId, isReplace ? "project.brochure.replace" : "project.brochure.upload", "Project", projectId, {
    before: isReplace
      ? { brochureFileName: project.brochureFileName, brochureFileSize: project.brochureFileSize, brochureVersion: project.brochureVersion }
      : undefined,
    after: { brochureFileName: file.name, brochureFileSize: file.size, brochureVersion: nextVersion },
  });

  await emit("MediaUploaded", { entityType: "Project", entityId: projectId, url: uploaded.url, kind: "brochure", actorId: session.userId });
  revalidateProject({ id: projectId, slug: project.slug });
  return { success: true };
}

/** Removes the CURRENT brochure only — admin-only, matching the rest of the CMS's delete/publish/archive gating. Older versions' files are untouched and remain listed (and downloadable) in history. */
export async function removeProjectBrochureAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slug: true, brochureUrl: true, brochureFileName: true, brochureVersion: true },
  });
  if (!project) return { error: "Project not found" };
  if (!project.brochureUrl) return { error: "No brochure to remove" };

  const publicId = documentPublicIdFromUrl(project.brochureUrl);
  if (publicId) {
    try {
      await deleteDocumentByPublicId(publicId);
    } catch {
      // Continue clearing the DB reference even if the remote asset is already gone.
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      brochureUrl: null,
      brochureFileName: null,
      brochureFileSize: null,
      brochureMimeType: null,
      brochureUploadedAt: null,
      brochureUploadedBy: null,
    },
  });

  await logAudit(session.userId, "project.brochure.delete", "Project", projectId, {
    before: { brochureFileName: project.brochureFileName, brochureVersion: project.brochureVersion },
    after: undefined,
  });

  await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: project.brochureUrl, actorId: session.userId });
  revalidateProject({ id: projectId, slug: project.slug });
  return {};
}
