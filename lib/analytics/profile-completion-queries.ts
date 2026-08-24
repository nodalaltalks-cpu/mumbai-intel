import "server-only";
import { prisma } from "@/lib/prisma";
import { PROFILE_COMPLETION_SECTIONS, type ProfileCompletionInput } from "@/lib/profile-completion";

/**
 * Founder-dashboard reads for profile completion — bucketing is done in JS
 * after a single findMany (not Prisma groupBy), matching this codebase's
 * established Neon-HTTP-adapter pattern for anything needing DB-side
 * aggregation the adapter can't do efficiently (see lib/analytics/brochure-queries.ts).
 */

export interface ProfileCompletionSummary {
  totalUsers: number;
  completedProfiles: number;
  incompleteProfiles: number;
  averageCompletionPercent: number;
}

export const COMPLETION_BUCKETS = [
  { key: "0-25", label: "0–25%", min: 0, max: 25 },
  { key: "26-50", label: "26–50%", min: 26, max: 50 },
  { key: "51-75", label: "51–75%", min: 51, max: 75 },
  { key: "76-99", label: "76–99%", min: 76, max: 99 },
  { key: "100", label: "100%", min: 100, max: 100 },
] as const;

export type CompletionBucketKey = (typeof COMPLETION_BUCKETS)[number]["key"];

export interface CompletionBucketCount {
  key: CompletionBucketKey;
  label: string;
  count: number;
}

export async function getProfileCompletionSummary(): Promise<ProfileCompletionSummary> {
  const users = await prisma.publicUser.findMany({ select: { profileCompletionPercent: true } });
  const totalUsers = users.length;
  const completedProfiles = users.filter((u) => u.profileCompletionPercent === 100).length;
  const incompleteProfiles = totalUsers - completedProfiles;
  const averageCompletionPercent =
    totalUsers === 0 ? 0 : Math.round(users.reduce((sum, u) => sum + u.profileCompletionPercent, 0) / totalUsers);

  return { totalUsers, completedProfiles, incompleteProfiles, averageCompletionPercent };
}

export async function getCompletionDistribution(): Promise<CompletionBucketCount[]> {
  const users = await prisma.publicUser.findMany({ select: { profileCompletionPercent: true } });
  return COMPLETION_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: users.filter((u) => u.profileCompletionPercent >= bucket.min && u.profileCompletionPercent <= bucket.max).length,
  }));
}

export interface ProfileCompletionUserRow {
  id: string;
  name: string | null;
  email: string;
  profileCompletionPercent: number;
  createdAt: Date;
}

/** Powers the clickable distribution-bucket filter — `bucket` is one of COMPLETION_BUCKETS' keys, or undefined for everyone. */
export async function getUsersByCompletionBucket(bucket?: CompletionBucketKey): Promise<ProfileCompletionUserRow[]> {
  const range = bucket ? COMPLETION_BUCKETS.find((b) => b.key === bucket) : undefined;
  return prisma.publicUser.findMany({
    where: range ? { profileCompletionPercent: { gte: range.min, lte: range.max } } : undefined,
    select: { id: true, name: true, email: true, profileCompletionPercent: true, createdAt: true },
    orderBy: { profileCompletionPercent: "desc" },
    take: 100,
  });
}

export interface FieldCompletionRate {
  key: string;
  label: string;
  completionRate: number;
  completedCount: number;
  skippedCount: number;
}

function toCompletionInput(user: {
  name: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  emailVerifiedAt: Date | null;
  preferences: {
    preferredBudgetMinRupees: number | null;
    preferredBudgetMaxRupees: number | null;
    preferredLocalityIds: string[];
    localityFreeText: string[];
    preferredCategories: string[];
    preferredConfigurations: string[];
    preferredReadiness: string[];
    purposes: string[];
    familySize: string | null;
    familyIncomeRange: string | null;
  } | null;
}): ProfileCompletionInput {
  return {
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
  };
}

/**
 * Per-field completion rate across every registered user (Section 10 —
 * "which fields are completed most / skipped most / cause friction"). One
 * findMany, aggregated in JS (same Neon-HTTP-adapter pattern as the bucket
 * queries above) rather than 13 separate COUNT queries. Skip counts come
 * from the real PROFILE_FIELD_SKIPPED event stream, not an estimate.
 */
export async function getFieldCompletionRates(): Promise<FieldCompletionRate[]> {
  const [users, skipEvents] = await Promise.all([
    prisma.publicUser.findMany({
      select: {
        name: true,
        phone: true,
        dateOfBirth: true,
        gender: true,
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
    }),
    prisma.researchEvent.findMany({ where: { eventType: "PROFILE_FIELD_SKIPPED" }, select: { metadata: true } }),
  ]);

  const skipCountByField = new Map<string, number>();
  for (const event of skipEvents) {
    const field = (event.metadata as { field?: string } | null)?.field;
    if (field) skipCountByField.set(field, (skipCountByField.get(field) ?? 0) + 1);
  }

  const totalUsers = users.length;
  return PROFILE_COMPLETION_SECTIONS.map((section) => {
    const completedCount = totalUsers === 0 ? 0 : users.filter((u) => section.isComplete(toCompletionInput(u))).length;
    return {
      key: section.key,
      label: section.label,
      completionRate: totalUsers === 0 ? 0 : Math.round((completedCount / totalUsers) * 100),
      completedCount,
      skippedCount: skipCountByField.get(section.key) ?? 0,
    };
  }).sort((a, b) => b.completionRate - a.completionRate);
}
