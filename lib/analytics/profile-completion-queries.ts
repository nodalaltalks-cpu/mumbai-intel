import "server-only";
import { prisma } from "@/lib/prisma";

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
