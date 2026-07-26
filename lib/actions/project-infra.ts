"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { INFRA_TYPES } from "@/lib/project-meta";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

export interface ProjectInfraActionState {
  error?: string;
}

const linkExistingSchema = z.object({
  infraId: z.string().min(1, "Choose a place"),
  distanceMeters: z.coerce.number().int().min(0),
  walkMinutes: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
});

/** Links an already-catalogued InfraAsset (metro station, school…) to a project. */
export async function linkProjectInfraAction(
  projectId: string,
  _prevState: ProjectInfraActionState,
  formData: FormData
): Promise<ProjectInfraActionState> {
  await requireMutateSession();

  const parsed = linkExistingSchema.safeParse({
    infraId: formData.get("infraId"),
    distanceMeters: formData.get("distanceMeters"),
    walkMinutes: formData.get("walkMinutes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await prisma.projectInfra.create({
      data: {
        projectId,
        infraId: parsed.data.infraId,
        distanceMeters: parsed.data.distanceMeters,
        walkMinutes: parsed.data.walkMinutes ?? null,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

const newAssetSchema = z.object({
  type: z.enum(INFRA_TYPES),
  name: z.string().trim().min(1, "Name is required"),
  distanceMeters: z.coerce.number().int().min(0),
  walkMinutes: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
});

/** Catalogues a brand-new nearby place (not yet in InfraAsset) and links it in one step. */
export async function createAndLinkProjectInfraAction(
  projectId: string,
  _prevState: ProjectInfraActionState,
  formData: FormData
): Promise<ProjectInfraActionState> {
  await requireMutateSession();

  const parsed = newAssetSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    distanceMeters: formData.get("distanceMeters"),
    walkMinutes: formData.get("walkMinutes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { cityId: true } });
  if (!project) return { error: "Project not found" };

  try {
    const asset = await prisma.infraAsset.create({
      data: { cityId: project.cityId, type: parsed.data.type, name: parsed.data.name },
    });
    await prisma.projectInfra.create({
      data: {
        projectId,
        infraId: asset.id,
        distanceMeters: parsed.data.distanceMeters,
        walkMinutes: parsed.data.walkMinutes ?? null,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function unlinkProjectInfraAction(linkId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  const link = await prisma.projectInfra.delete({ where: { id: linkId } });
  revalidatePath(`/admin/projects/${link.projectId}/edit`);
  return {};
}
