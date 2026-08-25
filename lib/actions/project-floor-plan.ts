"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
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

export interface FloorPlanActionState {
  error?: string;
  success?: boolean;
}

/**
 * Two kinds share the one floor-plan slot -- at most one ProjectDocument row
 * per project with either kind. Distinguished by kind (not a new mimeType
 * column) purely so the public/admin UI knows whether to render it through
 * the signed PDF-download proxy (Brochure's existing pattern) or as a plain
 * Cloudinary image URL (Section 33-36) -- no schema change either way, since
 * kind was already a free-text field.
 */
const FLOOR_PLAN_PDF_KIND = "floor_plan";
const FLOOR_PLAN_IMAGE_KIND = "floor_plan_image";
const FLOOR_PLAN_KINDS = [FLOOR_PLAN_PDF_KIND, FLOOR_PLAN_IMAGE_KIND];

/** First 5 bytes of a real PDF are always "%PDF-". */
async function isRealPdf(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...header) === "%PDF-";
}

/** Real magic-byte check for the three image formats FloorPlanUploader accepts -- never trusts the browser-reported MIME type alone, same reasoning as isRealPdf above. */
async function isRealImage(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return true;
  // WEBP: "RIFF" .... "WEBP"
  const ascii = String.fromCharCode(...header);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return true;
  return false;
}

async function deleteExistingFloorPlan(existing: { url: string; kind: string }): Promise<void> {
  try {
    if (existing.kind === FLOOR_PLAN_IMAGE_KIND) {
      const publicId = publicIdFromUrl(existing.url);
      if (publicId) await deleteImageByPublicId(publicId);
    } else {
      const publicId = documentPublicIdFromUrl(existing.url);
      if (publicId) await deleteDocumentByPublicId(publicId);
    }
  } catch {
    // Best-effort cleanup — the DB row is still removed either way (callers handle that).
  }
}

/**
 * Upload-or-replace — at most one floor_plan-kind ProjectDocument per
 * project, accepting either a PDF or an image (Section 33). The new file is
 * uploaded and confirmed stored *before* the old one is deleted (never
 * remove a valid existing file until the replacement genuinely exists).
 */
export async function uploadProjectFloorPlanAction(
  projectId: string,
  _prevState: FloorPlanActionState,
  formData: FormData
): Promise<FloorPlanActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or image file to upload" };
  }

  const isPdf = await isRealPdf(file);
  const isImage = !isPdf && (await isRealImage(file));
  if (!isPdf && !isImage) {
    return { error: "That file doesn't look like a real PDF or image. Please choose a PDF, PNG, JPG, or WEBP file." };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, slug: true } });
  if (!project) return { error: "Project not found" };

  let uploadedUrl: string;
  try {
    if (isPdf) {
      const uploaded = await uploadDocumentFile(file, `mumbai-intel/projects/${project.slug}/floor-plan`);
      uploadedUrl = uploaded.url;
    } else {
      // Floor plans carry small text/dimensions -- uploadImageFile's default quality:auto:good
      // is the same conservative (not aggressive) compression already used for gallery images,
      // verified elsewhere not to visibly degrade quality; never skipCompression here since a
      // multi-MB phone-camera floor plan photo genuinely benefits from it.
      const uploaded = await uploadImageFile(file, `mumbai-intel/projects/${project.slug}/floor-plan`);
      uploadedUrl = uploaded.url;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  const existing = await prisma.projectDocument.findFirst({ where: { projectId, kind: { in: FLOOR_PLAN_KINDS } } });

  await prisma.projectDocument.create({
    data: { projectId, title: "Floor Plan", url: uploadedUrl, kind: isPdf ? FLOOR_PLAN_PDF_KIND : FLOOR_PLAN_IMAGE_KIND },
  });

  // Only remove the previous file now that the new one is confirmed created.
  if (existing) {
    await deleteExistingFloorPlan(existing);
    await prisma.projectDocument.delete({ where: { id: existing.id } });
  }

  await emit("MediaUploaded", { entityType: "Project", entityId: projectId, url: uploadedUrl, kind: "floor_plan", actorId: session.userId });
  return { success: true };
}

export async function removeProjectFloorPlanAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const doc = await prisma.projectDocument.findFirst({ where: { projectId, kind: { in: FLOOR_PLAN_KINDS } } });
  if (!doc) return { error: "No floor plan uploaded for this project." };

  await deleteExistingFloorPlan(doc);
  await prisma.projectDocument.delete({ where: { id: doc.id } });
  await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: doc.url, actorId: session.userId });
  return {};
}
