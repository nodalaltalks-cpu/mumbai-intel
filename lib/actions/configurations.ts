"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const configurationSchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  bedrooms: z.coerce.number().min(0).max(20),
  carpetSqft: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  builtUpSqft: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

export interface ConfigurationActionState {
  error?: string;
}

export async function addConfigurationAction(
  projectId: string,
  _prevState: ConfigurationActionState,
  formData: FormData
): Promise<ConfigurationActionState> {
  await requireMutateSession();

  const parsed = configurationSchema.safeParse({
    label: formData.get("label"),
    bedrooms: formData.get("bedrooms"),
    carpetSqft: formData.get("carpetSqft"),
    builtUpSqft: formData.get("builtUpSqft"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const maxSort = await prisma.configuration.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.configuration.create({
      data: {
        projectId,
        label: data.label,
        bedrooms: data.bedrooms,
        carpetSqft: data.carpetSqft ?? null,
        builtUpSqft: data.builtUpSqft ?? null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function updateConfigurationAction(
  configurationId: string,
  projectId: string,
  _prevState: ConfigurationActionState,
  formData: FormData
): Promise<ConfigurationActionState> {
  await requireMutateSession();

  const parsed = configurationSchema.safeParse({
    label: formData.get("label"),
    bedrooms: formData.get("bedrooms"),
    carpetSqft: formData.get("carpetSqft"),
    builtUpSqft: formData.get("builtUpSqft"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  try {
    await prisma.configuration.update({
      where: { id: configurationId },
      data: {
        label: data.label,
        bedrooms: data.bedrooms,
        carpetSqft: data.carpetSqft ?? null,
        builtUpSqft: data.builtUpSqft ?? null,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteConfigurationAction(configurationId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  const config = await prisma.configuration.delete({ where: { id: configurationId } });
  revalidatePath(`/admin/projects/${config.projectId}/edit`);
  return {};
}
