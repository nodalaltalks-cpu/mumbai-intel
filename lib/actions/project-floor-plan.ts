"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { deleteDocumentByPublicId, documentPublicIdFromUrl, uploadDocumentFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";

export interface FloorPlanActionState {
  error?: string;
  success?: boolean;
}

/** Distinguishes the one floor-plan slot from the free-form Documents list — reuses the existing generic ProjectDocument model (no schema change) rather than a dedicated table, exactly like ProjectDocument's own doc comment already anticipated ("floor-plan sheets" is one of its named examples). */
const FLOOR_PLAN_KIND = "floor_plan";

/** First 5 bytes of a real PDF are always "%PDF-" — a cheap check that the upload genuinely is a PDF rather than just claiming to be one via its browser-reported MIME type (which a crafted request can lie about). */
async function isRealPdf(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);
  return signature === "%PDF-";
}

/**
 * Upload-or-replace — at most one floor_plan-kind ProjectDocument per
 * project. The new file is uploaded and confirmed stored *before* the old
 * one is deleted (Section 13: never remove a valid existing file until the
 * replacement genuinely exists), so a failed upload never leaves the
 * project without its previous floor plan.
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
    return { error: "Choose a PDF file to upload" };
  }
  if (!(await isRealPdf(file))) {
    return { error: "That file doesn't look like a real PDF. Please choose a valid PDF file." };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, slug: true } });
  if (!project) return { error: "Project not found" };

  let uploaded;
  try {
    uploaded = await uploadDocumentFile(file, `mumbai-intel/projects/${project.slug}/floor-plan`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }

  const existing = await prisma.projectDocument.findFirst({ where: { projectId, kind: FLOOR_PLAN_KIND } });

  await prisma.projectDocument.create({
    data: { projectId, title: "Floor Plan", url: uploaded.url, kind: FLOOR_PLAN_KIND },
  });

  // Only remove the previous file now that the new one is confirmed created — an orphaned old
  // asset if this step itself failed would be a much safer failure mode than losing the only copy.
  if (existing) {
    const oldPublicId = documentPublicIdFromUrl(existing.url);
    if (oldPublicId) {
      try {
        await deleteDocumentByPublicId(oldPublicId);
      } catch {
        // Best-effort cleanup — the DB row below is still removed either way.
      }
    }
    await prisma.projectDocument.delete({ where: { id: existing.id } });
  }

  await emit("MediaUploaded", { entityType: "Project", entityId: projectId, url: uploaded.url, kind: "floor_plan", actorId: session.userId });
  return { success: true };
}

export async function removeProjectFloorPlanAction(projectId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const doc = await prisma.projectDocument.findFirst({ where: { projectId, kind: FLOOR_PLAN_KIND } });
  if (!doc) return { error: "No floor plan uploaded for this project." };

  const publicId = documentPublicIdFromUrl(doc.url);
  if (publicId) {
    try {
      await deleteDocumentByPublicId(publicId);
    } catch {
      // Continue removing the DB row even if the remote asset is already gone.
    }
  }

  await prisma.projectDocument.delete({ where: { id: doc.id } });
  await emit("MediaDeleted", { entityType: "Project", entityId: projectId, url: doc.url, actorId: session.userId });
  return {};
}
