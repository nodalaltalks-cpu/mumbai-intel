"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const sectionSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  bodyHtml: z.string().trim().min(1, "Body is required"),
});

export interface SectionActionState {
  error?: string;
}

export async function addProjectSectionAction(
  projectId: string,
  _prevState: SectionActionState,
  formData: FormData
): Promise<SectionActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = sectionSchema.safeParse({
    title: formData.get("title"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.projectSection.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.projectSection.create({
      data: {
        projectId,
        title: parsed.data.title,
        bodyHtml: parsed.data.bodyHtml,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteProjectSectionAction(sectionId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const section = await prisma.projectSection.delete({ where: { id: sectionId } });
  revalidatePath(`/admin/projects/${section.projectId}/edit`);
  return {};
}
