"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { PROPERTY_CATEGORIES } from "@/lib/project-meta";
import { recalculatePublicUserCompletion } from "@/lib/profile-completion";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const preferencesSchema = z.object({
  preferredBudgetMinRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  preferredBudgetMaxRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  preferredCategory: z.preprocess(emptyToUndefined, z.enum(PROPERTY_CATEGORIES).optional()),
});

export interface PreferencesFormState {
  error?: string;
  success?: string;
}

/**
 * Saves budget/category/locality preferences — collected now for future
 * personalization (a personalized home feed, AI recommendations). Nothing
 * in this codebase reads these values to change what a user sees yet; this
 * is real, user-editable data, not a placeholder.
 */
export async function updatePreferencesAction(_prevState: PreferencesFormState, formData: FormData): Promise<PreferencesFormState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage preferences." };

  const parsed = preferencesSchema.safeParse({
    preferredBudgetMinRupees: formData.get("preferredBudgetMinRupees"),
    preferredBudgetMaxRupees: formData.get("preferredBudgetMaxRupees"),
    preferredCategory: formData.get("preferredCategory"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const preferredLocalityIds = formData.getAll("preferredLocalityIds").map(String).filter(Boolean);

  const data = {
    preferredBudgetMinRupees: parsed.data.preferredBudgetMinRupees ?? null,
    preferredBudgetMaxRupees: parsed.data.preferredBudgetMaxRupees ?? null,
    preferredCategory: parsed.data.preferredCategory ?? null,
    preferredLocalityIds,
  };

  const existing = await prisma.userPreferences.findUnique({ where: { publicUserId: session.userId } });
  if (existing) {
    await prisma.userPreferences.update({ where: { id: existing.id }, data });
  } else {
    await prisma.userPreferences.create({ data: { publicUserId: session.userId, ...data } });
  }

  await recalculatePublicUserCompletion(session.userId);

  revalidatePath("/account");
  return { success: "Preferences saved." };
}

export interface NotificationPreferencesFormState {
  error?: string;
  success?: string;
}

/**
 * Stores notification channel toggles. No notification is actually sent by
 * anything in this codebase today — see prisma/schema.prisma's
 * NotificationPreferences comment. This exists so the setting has
 * somewhere real to live the moment a sending job is built.
 */
export async function updateNotificationPreferencesAction(
  _prevState: NotificationPreferencesFormState,
  formData: FormData
): Promise<NotificationPreferencesFormState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage notification settings." };

  const data = {
    savedSearchAlerts: formData.get("savedSearchAlerts") === "on",
    weeklyDigest: formData.get("weeklyDigest") === "on",
    productUpdates: formData.get("productUpdates") === "on",
  };

  const existing = await prisma.notificationPreferences.findUnique({ where: { publicUserId: session.userId } });
  if (existing) {
    await prisma.notificationPreferences.update({ where: { id: existing.id }, data });
  } else {
    await prisma.notificationPreferences.create({ data: { publicUserId: session.userId, ...data } });
  }

  revalidatePath("/account");
  return { success: "Notification settings saved." };
}
