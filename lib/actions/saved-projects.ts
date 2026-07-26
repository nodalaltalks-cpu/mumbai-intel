"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";

export interface ToggleSavedProjectResult {
  saved: boolean;
  error?: string;
}

/** Bookmarks/unbookmarks a project for the signed-in public user. No-ops (returns an error) if not signed in. */
export async function toggleSavedProjectAction(projectId: string): Promise<ToggleSavedProjectResult> {
  const session = await getPublicSession();
  if (!session) return { saved: false, error: "Sign in to save projects." };

  const existing = await prisma.savedProject.findUnique({
    where: { publicUserId_projectId: { publicUserId: session.userId, projectId } },
  });

  if (existing) {
    await prisma.savedProject.delete({ where: { id: existing.id } });
    revalidatePath("/account");
    return { saved: false };
  }

  await prisma.savedProject.create({ data: { publicUserId: session.userId, projectId } });
  revalidatePath("/account");
  return { saved: true };
}

export async function isProjectSaved(projectId: string): Promise<boolean> {
  const session = await getPublicSession();
  if (!session) return false;
  const existing = await prisma.savedProject.findUnique({
    where: { publicUserId_projectId: { publicUserId: session.userId, projectId } },
  });
  return existing !== null;
}
