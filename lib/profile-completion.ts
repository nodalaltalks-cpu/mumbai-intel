import "server-only";
import { prisma } from "@/lib/prisma";
import { computeProfileCompletionPercent } from "@/lib/profile-completion-shared";
import { recordResearchEvent } from "@/lib/analytics/research-events";

// Re-exported so every existing server-side caller (actions, page.tsx) keeps
// importing from "@/lib/profile-completion" unchanged — only the client
// components import "@/lib/profile-completion-shared" directly.
export * from "@/lib/profile-completion-shared";

/**
 * Recomputes and persists `PublicUser.profileCompletionPercent` — the one
 * place this ever gets written. Call after any scored field changes: the
 * profile form save, the preferences form save, or email verification.
 * Single plain `update()`, no transaction (Neon HTTP adapter constraint).
 */
export async function recalculatePublicUserCompletion(publicUserId: string): Promise<number> {
  const user = await prisma.publicUser.findUnique({
    where: { id: publicUserId },
    select: {
      name: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      emailVerifiedAt: true,
      profileCompletionPercent: true,
      preferences: {
        select: {
          preferredBudgetMinRupees: true,
          preferredBudgetMaxRupees: true,
          preferredLocalityIds: true,
          localityFreeText: true,
          preferredCategories: true,
          preferredConfigurations: true,
          preferredReadiness: true,
          purposes: true,
          familySize: true,
          familyIncomeRange: true,
        },
      },
    },
  });
  if (!user) return 0;

  const percent = computeProfileCompletionPercent({
    name: user.name,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    gender: user.gender,
    emailVerified: user.emailVerifiedAt !== null,
    preferredBudgetMinRupees: user.preferences?.preferredBudgetMinRupees ?? null,
    preferredBudgetMaxRupees: user.preferences?.preferredBudgetMaxRupees ?? null,
    preferredLocalityIds: user.preferences?.preferredLocalityIds ?? [],
    localityFreeText: user.preferences?.localityFreeText ?? [],
    preferredCategories: user.preferences?.preferredCategories ?? [],
    preferredConfigurations: user.preferences?.preferredConfigurations ?? [],
    preferredReadiness: user.preferences?.preferredReadiness ?? [],
    purposes: user.preferences?.purposes ?? [],
    familySize: user.preferences?.familySize ?? null,
    familyIncomeRange: user.preferences?.familyIncomeRange ?? null,
  });

  await prisma.publicUser.update({ where: { id: publicUserId }, data: { profileCompletionPercent: percent } });

  if (percent > user.profileCompletionPercent) {
    await recordCompletionAfterReminderIfApplicable(publicUserId, user.profileCompletionPercent, percent);
  }

  return percent;
}

/**
 * Every completion recompute funnels through this one function (Server Action
 * form saves), so it's the single choke point to detect "did this user's
 * profile move forward after the founder reminded them" (Part 9) without
 * threading reminder-awareness through every individual save action. Fires
 * at most once per reminder — only when a founder-sent reminder exists with
 * no PROFILE_COMPLETION_AFTER_REMINDER already recorded for it since.
 */
async function recordCompletionAfterReminderIfApplicable(publicUserId: string, beforePercent: number, afterPercent: number): Promise<void> {
  const lastReminder = await prisma.researchEvent.findFirst({
    where: { eventType: "ADMIN_PROFILE_REMINDER_SENT", entityType: "PublicUser", entityId: publicUserId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!lastReminder) return;

  const alreadyFired = await prisma.researchEvent.findFirst({
    where: {
      eventType: "PROFILE_COMPLETION_AFTER_REMINDER",
      entityType: "PublicUser",
      entityId: publicUserId,
      createdAt: { gte: lastReminder.createdAt },
    },
    select: { id: true },
  });
  if (alreadyFired) return;

  await recordResearchEvent("PROFILE_COMPLETION_AFTER_REMINDER", {
    entityType: "PublicUser",
    entityId: publicUserId,
    metadata: { beforePercent, afterPercent },
  });
}
