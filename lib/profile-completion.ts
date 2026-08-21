import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Section-weighted completion engine for a public user's profile — mirrors
 * lib/project-completion.ts's shape exactly (a flat list of equally-weighted
 * `isComplete` predicates over real entered values only). `image` (avatar)
 * is deliberately excluded: it only ever comes from Google OAuth today, so
 * scoring it would make 100% unreachable for credentials-only accounts.
 * NotificationPreferences fields are excluded too — they always have a
 * non-null default, so "set" would be meaningless (the same reasoning that
 * fixed the Project 17%-on-a-brand-new-project bug).
 */
export interface ProfileCompletionInput {
  name?: string | null;
  phone?: string | null;
  emailVerified: boolean;
  preferredBudgetMinRupees?: number | null;
  preferredBudgetMaxRupees?: number | null;
  preferredLocalityIds: string[];
  localityFreeText: string[];
  preferredCategories: string[];
  purposes: string[];
}

interface CompletionSection {
  key: string;
  label: string;
  isComplete: (input: ProfileCompletionInput) => boolean;
}

export const PROFILE_COMPLETION_SECTIONS: CompletionSection[] = [
  { key: "name", label: "Name", isComplete: (i) => Boolean(i.name) },
  { key: "phone", label: "Phone number", isComplete: (i) => Boolean(i.phone) },
  { key: "emailVerified", label: "Verified email", isComplete: (i) => i.emailVerified },
  { key: "budget", label: "Budget range", isComplete: (i) => Boolean(i.preferredBudgetMinRupees) || Boolean(i.preferredBudgetMaxRupees) },
  { key: "localities", label: "Preferred locations", isComplete: (i) => i.preferredLocalityIds.length > 0 || i.localityFreeText.length > 0 },
  { key: "category", label: "Property type", isComplete: (i) => i.preferredCategories.length > 0 },
  { key: "purpose", label: "Purpose", isComplete: (i) => i.purposes.length > 0 },
];

export function computeProfileCompletionPercent(input: ProfileCompletionInput): number {
  const complete = PROFILE_COMPLETION_SECTIONS.filter((s) => s.isComplete(input)).length;
  return Math.round((complete / PROFILE_COMPLETION_SECTIONS.length) * 100);
}

export interface CompletionSectionStatus {
  key: string;
  label: string;
  complete: boolean;
}

/** The per-section checklist ("✓ Name / ○ Budget / ...") behind the completion %, for the progressive-profile checklist UI. */
export function getCompletionSections(input: ProfileCompletionInput): CompletionSectionStatus[] {
  return PROFILE_COMPLETION_SECTIONS.map((s) => ({ key: s.key, label: s.label, complete: s.isComplete(input) }));
}

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
          purposes: true,
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
    purposes: user.preferences?.purposes ?? [],
  });

  await prisma.publicUser.update({ where: { id: publicUserId }, data: { profileCompletionPercent: percent } });
  return percent;
}
