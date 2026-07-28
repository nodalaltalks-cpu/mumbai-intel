"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";

export interface SaveSearchResult {
  error?: string;
  id?: string;
}

/**
 * Saves the current /projects filter state under a user-chosen label.
 * `filters` is stored as-is (the same shape /projects already reads from
 * its own query string), so re-running a saved search never drifts from
 * what the live filter bar itself accepts.
 *
 * `notifyOnMatch` is accepted and stored, but no job in this codebase
 * currently reads it to send an alert — see prisma/schema.prisma's
 * SavedSearch comment. Storing the flag now costs nothing and means a
 * future matching+alert job needs no schema change to start honoring it.
 */
export async function saveSearchAction(label: string, filters: Record<string, string>, notifyOnMatch: boolean): Promise<SaveSearchResult> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to save searches." };

  const trimmedLabel = label.trim();
  if (!trimmedLabel) return { error: "Give this search a name." };

  const created = await prisma.savedSearch.create({
    data: { publicUserId: session.userId, label: trimmedLabel, filtersJson: filters, notifyOnMatch },
  });
  revalidatePath("/account");
  return { id: created.id };
}

export async function deleteSavedSearchAction(id: string): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage saved searches." };
  await prisma.savedSearch.deleteMany({ where: { id, publicUserId: session.userId } });
  revalidatePath("/account");
  return {};
}

export async function toggleSavedSearchNotifyAction(id: string, notifyOnMatch: boolean): Promise<{ error?: string }> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage saved searches." };
  await prisma.savedSearch.updateMany({ where: { id, publicUserId: session.userId }, data: { notifyOnMatch } });
  revalidatePath("/account");
  return {};
}
