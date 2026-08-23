"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { PROPERTY_CATEGORIES } from "@/lib/project-meta";
import { recalculatePublicUserCompletion } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const CONFIGURATIONS = ["1", "2", "3", "4"] as const;
const READINESS = ["READY_TO_MOVE", "UNDER_CONSTRUCTION", "NEW_LAUNCH"] as const;
const PURPOSES = ["SELF_USE", "INVESTMENT", "RESEARCHING"] as const;

const preferencesSchema = z.object({
  preferredBudgetMinRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  preferredBudgetMaxRupees: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

export interface PreferencesFormState {
  error?: string;
  success?: string;
  completionPercent?: number;
}

/**
 * Saves research/property preferences — collected for future personalization
 * (a personalized home feed, tailored recommendations) and, today, for the
 * founder's User Demand dashboard. This single action backs several
 * independent progressive-profile cards (Property Preferences, Budget,
 * Locations, Purpose) on /account, each submitting only the fields it owns —
 * `formData.has(...)` gates every field so a card's own submission never
 * blanks out preferences saved by a *different* card. Same find-then-
 * create-or-update pattern as everywhere else in this codebase (the Neon
 * HTTP adapter has no upsert()).
 */
export async function updatePreferencesAction(_prevState: PreferencesFormState, formData: FormData): Promise<PreferencesFormState> {
  const session = await getPublicSession();
  if (!session) return { error: "Sign in to manage preferences." };

  const parsed = preferencesSchema.safeParse({
    preferredBudgetMinRupees: formData.get("preferredBudgetMinRupees"),
    preferredBudgetMaxRupees: formData.get("preferredBudgetMaxRupees"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const data: Record<string, unknown> = {};

  if (formData.has("preferredBudgetMinRupees")) data.preferredBudgetMinRupees = parsed.data.preferredBudgetMinRupees ?? null;
  if (formData.has("preferredBudgetMaxRupees")) data.preferredBudgetMaxRupees = parsed.data.preferredBudgetMaxRupees ?? null;
  if (formData.has("preferredCategories") || formData.has("categoriesSubmitted")) {
    data.preferredCategories = formData
      .getAll("preferredCategories")
      .map(String)
      .filter((v): v is (typeof PROPERTY_CATEGORIES)[number] => (PROPERTY_CATEGORIES as readonly string[]).includes(v));
  }
  if (formData.has("preferredLocalityIds") || formData.has("localityIdsSubmitted")) {
    data.preferredLocalityIds = formData.getAll("preferredLocalityIds").map(String).filter(Boolean);
  }
  if (formData.has("preferredConfigurations") || formData.has("configurationsSubmitted")) {
    data.preferredConfigurations = formData
      .getAll("preferredConfigurations")
      .map(String)
      .filter((v): v is (typeof CONFIGURATIONS)[number] => (CONFIGURATIONS as readonly string[]).includes(v));
  }
  if (formData.has("preferredReadiness") || formData.has("readinessSubmitted")) {
    data.preferredReadiness = formData
      .getAll("preferredReadiness")
      .map(String)
      .filter((v): v is (typeof READINESS)[number] => (READINESS as readonly string[]).includes(v));
  }
  if (formData.has("purposes") || formData.has("purposesSubmitted")) {
    data.purposes = formData
      .getAll("purposes")
      .map(String)
      .filter((v): v is (typeof PURPOSES)[number] => (PURPOSES as readonly string[]).includes(v));
  }
  if (formData.has("localityFreeText") || formData.has("localityFreeTextSubmitted")) {
    data.localityFreeText = formData
      .getAll("localityFreeText")
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  let newlyAddedLocalities: string[] = [];
  try {
    const existing = await prisma.userPreferences.findUnique({ where: { publicUserId: session.userId } });
    if (existing) {
      await prisma.userPreferences.update({ where: { id: existing.id }, data });
    } else {
      await prisma.userPreferences.create({ data: { publicUserId: session.userId, ...data } });
    }
    if (Array.isArray(data.localityFreeText)) {
      const before = new Set((existing?.localityFreeText ?? []).map((t) => t.toLowerCase()));
      newlyAddedLocalities = (data.localityFreeText as string[]).filter((t) => !before.has(t.toLowerCase()));
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  // Founder-only demand signal (Section 13) — "many users are typing a locality
  // we don't cover" — never surfaced to the user themself. Fired per newly-added
  // term only, not on every save, so re-saving unrelated cards doesn't inflate it.
  for (const locality of newlyAddedLocalities) {
    await recordResearchEvent("LOCALITY_INTEREST_ADDED", { metadata: { locality } });
  }

  // Which of the 4 independent preference cards this particular save came
  // from — profile-completion step-level analytics (Section 15), reusing
  // the existing PROFILE_UPDATED type via metadata rather than one enum
  // value per card.
  const touchedSection = Object.keys(data)[0];
  if (touchedSection) {
    await recordResearchEvent("PROFILE_UPDATED", { entityType: "PublicUser", entityId: session.userId, metadata: { section: touchedSection } });
  }

  const wasComplete = (await prisma.publicUser.findUnique({ where: { id: session.userId }, select: { profileCompletionPercent: true } }))
    ?.profileCompletionPercent === 100;
  const completionPercent = await recalculatePublicUserCompletion(session.userId);
  if (!wasComplete && completionPercent === 100) {
    await recordResearchEvent("PROFILE_COMPLETED", { entityType: "PublicUser", entityId: session.userId, metadata: { source: "preferences" } });
  }

  revalidatePath("/account");
  return { success: "Saved.", completionPercent };
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

  try {
    const existing = await prisma.notificationPreferences.findUnique({ where: { publicUserId: session.userId } });
    if (existing) {
      await prisma.notificationPreferences.update({ where: { id: existing.id }, data });
    } else {
      await prisma.notificationPreferences.create({ data: { publicUserId: session.userId, ...data } });
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidatePath("/account");
  return { success: "Notification settings saved." };
}
