"use server";

import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import {
  deleteDocumentByPublicId,
  deleteImageByPublicId,
  documentPublicIdFromUrl,
  publicIdFromUrl,
  uploadDocumentFile,
  uploadImageFile,
} from "@/lib/cloudinary";
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

interface BrochureTargetProject {
  id: string;
  slug: string;
  brochureUrl: string | null;
  brochureFileName: string | null;
  brochureFileSize: number | null;
  brochureVersion: number;
}

/**
 * The one place a brochure file is actually validated, uploaded, and
 * persisted — used by both uploadProjectBrochureAction (edit page) and
 * createProjectAction's optional "attach a brochure while creating the
 * project" path, so there is exactly one upload code path regardless of
 * which page triggered it. Every call creates a new ProjectBrochureVersion
 * row (the version history) and repoints Project's "current brochure"
 * fields at it — the PREVIOUS version's Cloudinary file is deliberately
 * left alone (not deleted), so its history row keeps working even after a
 * replace. Only removeProjectBrochureAction ever deletes a file.
 */
export async function uploadBrochureForProject(project: BrochureTargetProject, file: File, actorId: string): Promise<BrochureActionState> {
  // Defense in depth: every current caller (uploadProjectBrochureAction,
  // createProjectAction) already checks the session before calling this, but
  // this function is exported and "use server" makes it a callable endpoint
  // in its own right — it must never trust a caller-supplied actorId alone.
  await requireMutateSession();

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF file to upload" };
  }
  if (file.type !== "application/pdf") {
    return { error: "Only PDF files are allowed" };
  }
  if (file.size > BROCHURE_MAX_BYTES) {
    return { error: `File is too large. Maximum size is ${Math.round(BROCHURE_MAX_BYTES / (1024 * 1024))}MB.` };
  }

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
      projectId: project.id,
      version: nextVersion,
      url: uploaded.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      uploadedByUserId: actorId,
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      brochureUrl: uploaded.url,
      brochureFileName: file.name,
      brochureFileSize: file.size,
      brochureMimeType: file.type,
      brochureUploadedAt: new Date(),
      brochureUploadedBy: actorId,
      brochureVersion: nextVersion,
    },
  });

  await logAudit(actorId, isReplace ? "project.brochure.replace" : "project.brochure.upload", "Project", project.id, {
    before: isReplace
      ? { brochureFileName: project.brochureFileName, brochureFileSize: project.brochureFileSize, brochureVersion: project.brochureVersion }
      : undefined,
    after: { brochureFileName: file.name, brochureFileSize: file.size, brochureVersion: nextVersion },
  });

  await emit("MediaUploaded", { entityType: "Project", entityId: project.id, url: uploaded.url, kind: "brochure", actorId });
  revalidateProject({ id: project.id, slug: project.slug });
  return { success: true };
}

export async function uploadProjectBrochureAction(
  projectId: string,
  _prevState: BrochureActionState,
  formData: FormData
): Promise<BrochureActionState> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a PDF file to upload" };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      slug: true,
      brochureUrl: true,
      brochureFileName: true,
      brochureFileSize: true,
      brochureVersion: true,
    },
  });
  if (!project) return { error: "Project not found" };

  return uploadBrochureForProject(project, file, session.userId);
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

/**
 * Clickable preview image shown on the public brochure download card —
 * a plain Cloudinary image upload (reuses uploadImageFile, same as the
 * gallery/cover image), not part of the PDF versioning system. Only one
 * thumbnail exists at a time: uploading a replacement deletes the old
 * Cloudinary image immediately (unlike brochure PDF versions, a thumbnail
 * has no history value worth keeping around).
 */
export async function uploadBrochureThumbnailAction(
  projectId: string,
  _prevState: BrochureActionState,
  formData: FormData
): Promise<BrochureActionState> {
  const session = await requireMutateSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file to upload" };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, slug: true, brochureThumbnailUrl: true },
  });
  if (!project) return { error: "Project not found" };

  let uploaded;
  try {
    uploaded = await uploadImageFile(file, `mumbai-intel/projects/${project.slug}/brochure-thumbnail`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  const previousUrl = project.brochureThumbnailUrl;

  await prisma.project.update({
    where: { id: projectId },
    data: { brochureThumbnailUrl: uploaded.url },
  });

  if (previousUrl) {
    const previousPublicId = publicIdFromUrl(previousUrl);
    if (previousPublicId) {
      try {
        await deleteImageByPublicId(previousPublicId);
      } catch {
        // Continue — the DB pointer already moved to the new image.
      }
    }
  }

  await logAudit(session.userId, previousUrl ? "project.brochureThumbnail.replace" : "project.brochureThumbnail.upload", "Project", projectId, {
    before: previousUrl ? { brochureThumbnailUrl: previousUrl } : undefined,
    after: { brochureThumbnailUrl: uploaded.url },
  });

  await emit("MediaUploaded", { entityType: "Project", entityId: projectId, url: uploaded.url, kind: "brochureThumbnail", actorId: session.userId });
  revalidateProject({ id: projectId, slug: project.slug });
  return { success: true };
}

export async function removeBrochureThumbnailAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slug: true, brochureThumbnailUrl: true },
  });
  if (!project) return { error: "Project not found" };
  if (!project.brochureThumbnailUrl) return { error: "No thumbnail to remove" };

  const publicId = publicIdFromUrl(project.brochureThumbnailUrl);
  if (publicId) {
    try {
      await deleteImageByPublicId(publicId);
    } catch {
      // Continue clearing the DB reference even if the remote asset is already gone.
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { brochureThumbnailUrl: null },
  });

  await logAudit(session.userId, "project.brochureThumbnail.delete", "Project", projectId, {
    before: { brochureThumbnailUrl: project.brochureThumbnailUrl },
    after: undefined,
  });

  await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: project.brochureThumbnailUrl, actorId: session.userId });
  revalidateProject({ id: projectId, slug: project.slug });
  return {};
}
