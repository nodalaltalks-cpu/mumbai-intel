"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { DATA_SOURCES, CONFIDENCE_LEVELS } from "@/lib/project-meta";
import { friendlyPrismaError } from "./errors";

const NOTE_KINDS = ["summary", "pro", "con"] as const;

const noteSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  body: z.string().trim().min(1, "Body is required"),
  dataSource: z.enum(DATA_SOURCES),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export interface InvestmentNoteActionState {
  error?: string;
}

export async function addInvestmentNoteAction(
  projectId: string,
  _prevState: InvestmentNoteActionState,
  formData: FormData
): Promise<InvestmentNoteActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = noteSchema.safeParse({
    kind: formData.get("kind"),
    body: formData.get("body"),
    dataSource: formData.get("dataSource"),
    confidence: formData.get("confidence"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.investmentNote.aggregate({
    where: { projectId, kind: parsed.data.kind },
    _max: { sortOrder: true },
  });

  try {
    await prisma.investmentNote.create({
      data: {
        projectId,
        kind: parsed.data.kind,
        body: parsed.data.body,
        dataSource: parsed.data.dataSource,
        confidence: parsed.data.confidence,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function updateInvestmentNoteAction(
  noteId: string,
  projectId: string,
  _prevState: InvestmentNoteActionState,
  formData: FormData
): Promise<InvestmentNoteActionState> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }

  const parsed = noteSchema.safeParse({
    kind: formData.get("kind"),
    body: formData.get("body"),
    dataSource: formData.get("dataSource"),
    confidence: formData.get("confidence"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await prisma.investmentNote.update({
      where: { id: noteId },
      data: {
        kind: parsed.data.kind,
        body: parsed.data.body,
        dataSource: parsed.data.dataSource,
        confidence: parsed.data.confidence,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteInvestmentNoteAction(noteId: string): Promise<{ error?: string }> {
  const session = await requireMutateSession();
  if (!(await hasPermission(session, "content.edit"))) {
    return { error: "You don't have permission to do this." };
  }
  const note = await prisma.investmentNote.delete({ where: { id: noteId } });
  revalidatePath(`/admin/projects/${note.projectId}/edit`);
  return {};
}
