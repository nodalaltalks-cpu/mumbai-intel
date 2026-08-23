"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const specificationSchema = z.object({
  category: z.string().trim().min(1, "Category is required"),
  detail: z.string().trim().min(1, "Detail is required"),
});

export interface SpecificationActionState {
  error?: string;
}

export async function addProjectSpecificationAction(
  projectId: string,
  _prevState: SpecificationActionState,
  formData: FormData
): Promise<SpecificationActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = specificationSchema.safeParse({
    category: formData.get("category"),
    detail: formData.get("detail"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.projectSpecification.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.projectSpecification.create({
      data: {
        projectId,
        category: parsed.data.category,
        detail: parsed.data.detail,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteProjectSpecificationAction(specificationId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const spec = await prisma.projectSpecification.delete({ where: { id: specificationId } });
  revalidatePath(`/admin/projects/${spec.projectId}/edit`);
  return {};
}
