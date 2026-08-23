"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicSession } from "@/lib/public-auth/session";
import { PROPERTY_CATEGORIES } from "@/lib/project-meta";
import { recalculatePublicUserCompletion, getMilestoneCrossed } from "@/lib/profile-completion";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { friendlyPrismaError } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

// Existing BHK buckets plus the non-BHK property forms the founder asked to
// add — kept in the same String[] column rather than a new field, since
// "configuration" already means "the shapes of property this user is open
// to," and these are just more values in that same list.
const CONFIGURATIONS = ["1", "2", "3", "4", "PENTHOUSE", "DUPLEX", "BUNGALOW", "PLOT", "LAND"] as const;
// NEW_LAUNCH kept (never remove an existing option) alongside the two new
// values the founder asked for — PRE_LAUNCH is genuinely distinct from
// NEW_LAUNCH (announced/marketed vs. formally launched), and
// NEAR_POSSESSION_6M sits between UNDER_CONSTRUCTION and READY_TO_MOVE.
const READINESS = ["PRE_LAUNCH", "NEW_LAUNCH", "UNDER_CONSTRUCTION", "NEAR_POSSESSION_6M", "READY_TO_MOVE"] as const;
const PURPOSES = ["SELF_USE", "INVESTMENT", "RESEARCHING"] as const;
const FAMILY_SIZES = ["1", "2", "3", "4", "5", "6_PLUS", "PREFER_NOT_TO_SAY"] as const;
const FAMILY_INCOME_RANGES = ["BELOW_5L", "5L_10L", "10L_20L", "20L_50L", "50L_1CR", "1CR_PLUS", "PREFER_NOT_TO_SAY"] as const;

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
  if (formData.has("familySize")) {
    const v = String(formData.get("familySize"));
    data.familySize = (FAMILY_SIZES as readonly string[]).includes(v) ? v : null;
  }
  if (formData.has("familyIncomeRange")) {
    const v = String(formData.get("familyIncomeRange"));
    data.familyIncomeRange = (FAMILY_INCOME_RANGES as readonly string[]).includes(v) ? v : null;
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

  // Which of the independent preference cards this particular save came
  // from — profile-completion step-level analytics. Field key only, never
  // the actual value (never the budget amount, income bracket, etc.).
  const touchedSection = Object.keys(data)[0];
  if (touchedSection) {
    await recordResearchEvent("PROFILE_UPDATED", { entityType: "PublicUser", entityId: session.userId, metadata: { section: touchedSection } });
    const FIELD_KEY: Record<string, string> = {
      preferredBudgetMinRupees: "budget",
      preferredBudgetMaxRupees: "budget",
      preferredCategories: "category",
      preferredConfigurations: "configuration",
      preferredReadiness: "readiness",
      purposes: "purpose",
      preferredLocalityIds: "localities",
      localityFreeText: "localities",
      familySize: "familySize",
      familyIncomeRange: "familyIncome",
    };
    const fieldKey = FIELD_KEY[touchedSection];
    const value = data[touchedSection];
    const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
    if (fieldKey && filled) {
      await recordResearchEvent("PROFILE_FIELD_COMPLETED", { entityType: "PublicUser", entityId: session.userId, metadata: { field: fieldKey } });
    }
  }

  const before = (await prisma.publicUser.findUnique({ where: { id: session.userId }, select: { profileCompletionPercent: true } }))
    ?.profileCompletionPercent ?? 0;
  const completionPercent = await recalculatePublicUserCompletion(session.userId);
  if (before !== 100 && completionPercent === 100) {
    await recordResearchEvent("PROFILE_COMPLETED", { entityType: "PublicUser", entityId: session.userId, metadata: { source: "preferences" } });
  } else {
    const milestone = getMilestoneCrossed(before, completionPercent);
    if (milestone) {
      await recordResearchEvent(`PROFILE_COMPLETION_${milestone}` as Parameters<typeof recordResearchEvent>[0], {
        entityType: "PublicUser",
        entityId: session.userId,
      });
    }
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
