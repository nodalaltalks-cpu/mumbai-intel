/**
 * Pure completion-scoring logic with zero server-only dependencies (no
 * prisma, no "server-only" import) — split out of lib/profile-completion.ts
 * specifically so client components (ProfileCompletionBar,
 * profile-completion-client.tsx) can compute the same percent/section
 * breakdown locally for instant, no-round-trip UI updates, without pulling
 * "server-only" into the client bundle graph. lib/profile-completion.ts
 * re-exports everything here for server-side callers, so nothing server-side
 * needs to change its imports.
 *
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
  dateOfBirth?: Date | null;
  gender?: string | null;
  emailVerified: boolean;
  preferredBudgetMinRupees?: number | null;
  preferredBudgetMaxRupees?: number | null;
  preferredLocalityIds: string[];
  localityFreeText: string[];
  preferredCategories: string[];
  preferredConfigurations: string[];
  preferredReadiness: string[];
  purposes: string[];
  familySize?: string | null;
  familyIncomeRange?: string | null;
}

export type ProfileSectionKey = "personal" | "property" | "budget" | "location" | "status" | "purpose" | "family";

interface CompletionSection {
  key: string;
  label: string;
  section: ProfileSectionKey;
  isComplete: (input: ProfileCompletionInput) => boolean;
}

export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  personal: "Personal Details",
  property: "Property Requirements",
  budget: "Budget",
  location: "Location",
  status: "Property Status",
  purpose: "Purpose",
  family: "Family / Household",
};

export const PROFILE_COMPLETION_SECTIONS: CompletionSection[] = [
  { key: "name", label: "Name", section: "personal", isComplete: (i) => Boolean(i.name) },
  { key: "phone", label: "Phone number", section: "personal", isComplete: (i) => Boolean(i.phone) },
  { key: "emailVerified", label: "Verified email", section: "personal", isComplete: (i) => i.emailVerified },
  { key: "dateOfBirth", label: "Date of birth", section: "personal", isComplete: (i) => Boolean(i.dateOfBirth) },
  { key: "gender", label: "Gender", section: "personal", isComplete: (i) => Boolean(i.gender) },
  { key: "category", label: "Property type", section: "property", isComplete: (i) => i.preferredCategories.length > 0 },
  { key: "configuration", label: "Configuration", section: "property", isComplete: (i) => i.preferredConfigurations.length > 0 },
  { key: "budget", label: "Budget range", section: "budget", isComplete: (i) => Boolean(i.preferredBudgetMinRupees) || Boolean(i.preferredBudgetMaxRupees) },
  { key: "localities", label: "Preferred locations", section: "location", isComplete: (i) => i.preferredLocalityIds.length > 0 || i.localityFreeText.length > 0 },
  { key: "readiness", label: "Property status", section: "status", isComplete: (i) => i.preferredReadiness.length > 0 },
  { key: "purpose", label: "Purpose", section: "purpose", isComplete: (i) => i.purposes.length > 0 },
  { key: "familySize", label: "Family size", section: "family", isComplete: (i) => Boolean(i.familySize) },
  { key: "familyIncome", label: "Family income", section: "family", isComplete: (i) => Boolean(i.familyIncomeRange) },
];

export function computeProfileCompletionPercent(input: ProfileCompletionInput): number {
  const complete = PROFILE_COMPLETION_SECTIONS.filter((s) => s.isComplete(input)).length;
  return Math.round((complete / PROFILE_COMPLETION_SECTIONS.length) * 100);
}

export interface CompletionSectionStatus {
  key: string;
  label: string;
  section: ProfileSectionKey;
  complete: boolean;
}

/** The per-field checklist ("✓ Name / ○ Budget / ...") behind the completion %, for the progressive-profile checklist UI. */
export function getCompletionSections(input: ProfileCompletionInput): CompletionSectionStatus[] {
  return PROFILE_COMPLETION_SECTIONS.map((s) => ({ key: s.key, label: s.label, section: s.section, complete: s.isComplete(input) }));
}

export interface SectionProgress {
  section: ProfileSectionKey;
  label: string;
  completeCount: number;
  totalCount: number;
}

/** Groups the same per-field checklist into per-section progress ("Budget: 1/1", "Family: 0/2") — the exact same PROFILE_COMPLETION_SECTIONS list, just aggregated, so section progress can never drift out of sync with the overall percent. */
export function getSectionProgress(sections: CompletionSectionStatus[]): SectionProgress[] {
  const order: ProfileSectionKey[] = ["personal", "property", "budget", "location", "status", "purpose", "family"];
  return order.map((section) => {
    const inSection = sections.filter((s) => s.section === section);
    return {
      section,
      label: PROFILE_SECTION_LABELS[section],
      completeCount: inSection.filter((s) => s.complete).length,
      totalCount: inSection.length,
    };
  });
}

const MILESTONES = [25, 50, 75, 90] as const;

/** Highest milestone (25/50/75/90) strictly crossed going from `before` to `after` — null if none, so callers only fire a PROFILE_COMPLETION_XX event on a genuine crossing, never on every save. 100 is intentionally excluded here; callers already check that separately against PROFILE_COMPLETED. */
export function getMilestoneCrossed(before: number, after: number): (typeof MILESTONES)[number] | null {
  let crossed: (typeof MILESTONES)[number] | null = null;
  for (const m of MILESTONES) {
    if (before < m && after >= m) crossed = m;
  }
  return crossed;
}
