"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const timelineEventSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  eventDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
});

export interface TimelineActionState {
  error?: string;
}

export async function addProjectTimelineEventAction(
  projectId: string,
  _prevState: TimelineActionState,
  formData: FormData
): Promise<TimelineActionState> {
  await requireMutateSession();

  const parsed = timelineEventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    eventDate: formData.get("eventDate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const maxSort = await prisma.projectTimelineEvent.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.projectTimelineEvent.create({
      data: {
        projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        eventDate: parsed.data.eventDate ?? null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath(`/admin/projects/${projectId}/edit`);
  return {};
}

export async function deleteProjectTimelineEventAction(eventId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  const event = await prisma.projectTimelineEvent.delete({ where: { id: eventId } });
  revalidatePath(`/admin/projects/${event.projectId}/edit`);
  return {};
}
