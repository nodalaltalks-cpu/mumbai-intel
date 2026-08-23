"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required"),
  answer: z.string().trim().min(1, "Answer is required"),
});

export interface FaqActionState {
  error?: string;
}

export async function addProjectFaqAction(
  projectId: string,
  _prevState: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = faqSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.projectFaq.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.projectFaq.create({
      data: {
        projectId,
        question: parsed.data.question,
        answer: parsed.data.answer,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteProjectFaqAction(faqId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const faq = await prisma.projectFaq.delete({ where: { id: faqId } });
  revalidatePath(`/admin/projects/${faq.projectId}/edit`);
  return {};
}
