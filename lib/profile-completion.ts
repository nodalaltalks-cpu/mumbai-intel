import "server-only";
import { prisma } from "@/lib/prisma";
import { computeProfileCompletionPercent } from "@/lib/profile-completion-shared";

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
      emailVerifiedAt: true,
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
  return percent;
}
