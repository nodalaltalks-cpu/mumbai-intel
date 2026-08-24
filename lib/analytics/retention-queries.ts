import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfISOWeek } from "./period";
import type { AnalyticsPeriod } from "./period";
import { COMPLETION_BUCKETS } from "./profile-completion-queries";

/**
 * The active-user definition used throughout this app (Dashboard's DAU/WAU/
 * MAU, Registered Users' lastActiveAt, and here): a PublicUser with at least
 * one ResearchEvent — any of the 30+ event types (project/builder/locality/
 * transaction view, search, compare, wishlist, brochure download, report
 * view, notification open/click, login, ...) — in the window in question.
 * Reused exactly, not redefined, from lib/admin-queries.ts's
 * getUserGrowthStats/getRegisteredUsersPeriodStats. Documented here because
 * this is the page a founder reads to understand what "active" means.
 */
export const ACTIVE_USER_DEFINITION =
  "A user counts as active for a given window if they have at least one recorded research event in it — viewing a project/builder/locality/transaction, " +
  "performing a search, comparing, saving a project, saving a search, downloading a brochure, viewing a report, opening or clicking a notification, or " +
  "logging in. The same definition powers the Dashboard's Daily/Weekly/Monthly Active counts and the Registered Users list's activity column.";

export interface RetentionSnapshot {
  dau: number;
  wau: number;
  mau: number;
  newUsersInPeriod: number;
  returningUsersInPeriod: number;
  activeUsersInPeriod: number;
  inactiveUsers: number;
  totalUsers: number;
}

/** Period-scoped new-vs-returning-vs-inactive breakdown, on top of the existing fixed-window DAU/WAU/MAU (passed in, not recomputed, so this page always agrees with the Dashboard). */
export async function getRetentionSnapshot(period: AnalyticsPeriod, dau: number, wau: number, mau: number): Promise<RetentionSnapshot> {
  const [totalUsers, newUserIds, activeUserIds] = await Promise.all([
    prisma.publicUser.count(),
    prisma.publicUser.findMany({ where: { createdAt: { gte: period.since, lt: period.until } }, select: { id: true } }),
    prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { not: null }, createdAt: { gte: period.since, lt: period.until } } }),
  ]);

  const newIds = new Set(newUserIds.map((u) => u.id));
  const activeIds = new Set(activeUserIds.map((g) => g.publicUserId as string));
  const returning = [...activeIds].filter((id) => !newIds.has(id)).length;

  return {
    dau,
    wau,
    mau,
    newUsersInPeriod: newIds.size,
    returningUsersInPeriod: returning,
    activeUsersInPeriod: activeIds.size,
    inactiveUsers: Math.max(0, totalUsers - activeIds.size),
    totalUsers,
  };
}

const RETENTION_DAYS = [1, 7, 14, 30, 60, 90] as const;

export interface RetentionCohort {
  cohortLabel: string;
  cohortStart: Date;
  cohortSize: number;
  retention: { day: number; percent: number | null }[];
}

/**
 * Weekly signup cohorts (Section 9's own example groups by "Week 1" /
 * "Week 2") — for each cohort, day-N retention is measured from the
 * cohort's week-start, not each user's exact signup day, so the whole
 * cohort shares one set of day boundaries. A defensible, standard
 * simplification for a weekly-cohort view, and the only shape that lets
 * "compare cohorts" mean anything (individual per-user offsets wouldn't
 * align between cohorts).
 */
export async function getRetentionCohorts(numWeeks = 8): Promise<RetentionCohort[]> {
  const now = new Date();
  const thisWeekStart = startOfISOWeek(now);
  const cohorts: RetentionCohort[] = [];

  for (let i = numWeeks - 1; i >= 0; i--) {
    const cohortStart = new Date(thisWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const cohortEnd = new Date(cohortStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const users = await prisma.publicUser.findMany({
      where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
      select: { id: true },
    });
    if (users.length === 0) {
      cohorts.push({ cohortLabel: cohortRangeLabel(cohortStart), cohortStart, cohortSize: 0, retention: RETENTION_DAYS.map((d) => ({ day: d, percent: null })) });
      continue;
    }
    const userIds = users.map((u) => u.id);

    const retention = await Promise.all(
      RETENTION_DAYS.map(async (day) => {
        const dayStart = new Date(cohortStart.getTime() + day * 24 * 60 * 60 * 1000);
        // A day this far out hasn't happened yet for a recent cohort -- report "not enough time
        // has passed" (null) rather than a misleadingly low 0%.
        if (dayStart > now) return { day, percent: null };
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const activeGroups = await prisma.researchEvent.groupBy({
          by: ["publicUserId"],
          where: { publicUserId: { in: userIds }, createdAt: { gte: dayStart, lt: dayEnd } },
        });
        return { day, percent: Math.round((activeGroups.length / userIds.length) * 1000) / 10 };
      })
    );

    cohorts.push({ cohortLabel: cohortRangeLabel(cohortStart), cohortStart, cohortSize: users.length, retention });
  }

  return cohorts;
}

function cohortRangeLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

export interface FeatureRetentionRow {
  feature: string;
  didFeatureCount: number;
  didFeatureReturnRate: number | null;
  didNotFeatureCount: number;
  didNotFeatureReturnRate: number | null;
}

/** "Still had activity N+ days after signup" — the per-user retention check that getRetentionCohorts applies per-cohort-week, applied here per-user instead, split by whether they ever did a given feature action (or, for getProfileCompletionRetention, which completion bucket they're in). Every row is a behavioural comparison (Section 12/25/11), never framed as causal. */
async function returnRateAfterDays(userIds: string[], days: number): Promise<number | null> {
  if (userIds.length === 0) return null;
  const [users, lastActiveGroups] = await Promise.all([
    prisma.publicUser.findMany({ where: { id: { in: userIds } }, select: { id: true, createdAt: true } }),
    prisma.researchEvent.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: userIds } }, _max: { createdAt: true } }),
  ]);
  const lastActiveById = new Map(lastActiveGroups.map((g) => [g.publicUserId as string, g._max.createdAt]));
  const windowMs = days * 24 * 60 * 60 * 1000;
  const eligible = users.filter((u) => Date.now() - u.createdAt.getTime() >= windowMs);
  if (eligible.length === 0) return null;
  const retained = eligible.filter((u) => {
    const lastActive = lastActiveById.get(u.id);
    return lastActive && lastActive.getTime() >= u.createdAt.getTime() + windowMs;
  }).length;
  return Math.round((retained / eligible.length) * 1000) / 10;
}

async function sevenDayReturnRate(userIds: string[]): Promise<number | null> {
  return returnRateAfterDays(userIds, 7);
}

/** Section 12: does using feature X correlate with a user still being active a week later? */
export async function getFeatureRetention(): Promise<FeatureRetentionRow[]> {
  const allUsers = await prisma.publicUser.findMany({ select: { id: true } });
  const allIds = new Set(allUsers.map((u) => u.id));

  async function splitByFeature(label: string, didIds: string[]): Promise<FeatureRetentionRow> {
    const didSet = new Set(didIds);
    const didNotIds = [...allIds].filter((id) => !didSet.has(id));
    const [didRate, didNotRate] = await Promise.all([sevenDayReturnRate(didIds), sevenDayReturnRate(didNotIds)]);
    return { feature: label, didFeatureCount: didIds.length, didFeatureReturnRate: didRate, didNotFeatureCount: didNotIds.length, didNotFeatureReturnRate: didNotRate };
  }

  const [savedProjectUsers, savedSearchUsers, brochureUsers, notificationClickUsers] = await Promise.all([
    prisma.savedProject.findMany({ select: { publicUserId: true }, distinct: ["publicUserId"] }),
    prisma.savedSearch.findMany({ select: { publicUserId: true }, distinct: ["publicUserId"] }),
    prisma.brochureDownloadEvent.findMany({ where: { publicUserId: { not: null } }, select: { publicUserId: true }, distinct: ["publicUserId"] }),
    prisma.researchEvent.findMany({ where: { eventType: "NOTIFICATION_CLICKED", publicUserId: { not: null } }, select: { publicUserId: true }, distinct: ["publicUserId"] }),
  ]);

  return Promise.all([
    splitByFeature("Saved a project", savedProjectUsers.map((u) => u.publicUserId)),
    splitByFeature("Saved a search", savedSearchUsers.map((u) => u.publicUserId)),
    splitByFeature("Downloaded a brochure", brochureUsers.map((u) => u.publicUserId as string)),
    splitByFeature("Clicked a notification", notificationClickUsers.map((u) => u.publicUserId as string)),
  ]);
}

export interface SearchRetentionComparison {
  activeSearchersReturnRate: number | null;
  activeSearchersCount: number;
  lightSearchersReturnRate: number | null;
  lightSearchersCount: number;
}

/** Section 25: users with 3+ searches in their first week vs. 0–2 — same 7-day-return metric, sliced by early search activity instead of a feature flag. */
export async function getSearchRetentionCorrelation(): Promise<SearchRetentionComparison> {
  const users = await prisma.publicUser.findMany({ select: { id: true, createdAt: true } });
  if (users.length === 0) return { activeSearchersReturnRate: null, activeSearchersCount: 0, lightSearchersReturnRate: null, lightSearchersCount: 0 };

  const searchCounts = await Promise.all(
    users.map(async (u) => {
      const weekEnd = new Date(u.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = await prisma.researchEvent.count({
        where: { publicUserId: u.id, eventType: { in: ["SEARCH_PERFORMED", "TRANSACTION_SEARCHED"] }, createdAt: { gte: u.createdAt, lt: weekEnd } },
      });
      return { id: u.id, count };
    })
  );

  const activeIds = searchCounts.filter((s) => s.count >= 3).map((s) => s.id);
  const lightIds = searchCounts.filter((s) => s.count < 3).map((s) => s.id);
  const [activeRate, lightRate] = await Promise.all([sevenDayReturnRate(activeIds), sevenDayReturnRate(lightIds)]);

  return { activeSearchersReturnRate: activeRate, activeSearchersCount: activeIds.length, lightSearchersReturnRate: lightRate, lightSearchersCount: lightIds.length };
}

export interface ProfileCompletionRetentionRow {
  bucketKey: string;
  bucketLabel: string;
  userCount: number;
  sevenDayReturnRate: number | null;
  thirtyDayReturnRate: number | null;
  avgProjectViews: number;
  avgSearches: number;
  avgSavedProjects: number;
  avgSavedSearches: number;
  avgContactEnquiries: number;
}

/**
 * Section 11 — does a more-complete research profile correlate with a user
 * coming back more, searching more, saving more? Buckets every registered
 * user by the exact same 0–25/26–50/51–75/76–99/100 ranges the Profile
 * Completion page already uses (COMPLETION_BUCKETS, imported rather than
 * redefined), then reuses this file's existing return-rate helper per
 * bucket — same event pipeline, same "correlation not causation" framing as
 * getFeatureRetention/getSearchRetentionCorrelation above, not a new
 * analytics system.
 */
export async function getProfileCompletionRetention(): Promise<ProfileCompletionRetentionRow[]> {
  const users = await prisma.publicUser.findMany({ select: { id: true, profileCompletionPercent: true } });
  if (users.length === 0) return [];

  const allIds = users.map((u) => u.id);
  const [viewGroups, searchGroups, savedProjectGroups, savedSearchGroups, enquiryGroups] = await Promise.all([
    prisma.recentView.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: allIds }, entityType: "Project" }, _count: { _all: true } }),
    prisma.searchHistory.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: allIds } }, _count: { _all: true } }),
    prisma.savedProject.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: allIds } }, _count: { _all: true } }),
    prisma.savedSearch.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: allIds } }, _count: { _all: true } }),
    prisma.contactEnquiry.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: allIds } }, _count: { _all: true } }),
  ]);
  const viewCountById = new Map(viewGroups.map((g) => [g.publicUserId, g._count._all]));
  const searchCountById = new Map(searchGroups.map((g) => [g.publicUserId, g._count._all]));
  const savedProjectCountById = new Map(savedProjectGroups.map((g) => [g.publicUserId, g._count._all]));
  const savedSearchCountById = new Map(savedSearchGroups.map((g) => [g.publicUserId, g._count._all]));
  const enquiryCountById = new Map(enquiryGroups.map((g) => [g.publicUserId as string, g._count._all]));

  function average(ids: string[], byId: Map<string, number>): number {
    if (ids.length === 0) return 0;
    const total = ids.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
    return Math.round((total / ids.length) * 10) / 10;
  }

  return Promise.all(
    COMPLETION_BUCKETS.map(async (bucket) => {
      const idsInBucket = users.filter((u) => u.profileCompletionPercent >= bucket.min && u.profileCompletionPercent <= bucket.max).map((u) => u.id);
      const [sevenDay, thirtyDay] = await Promise.all([returnRateAfterDays(idsInBucket, 7), returnRateAfterDays(idsInBucket, 30)]);
      return {
        bucketKey: bucket.key,
        bucketLabel: bucket.label,
        userCount: idsInBucket.length,
        sevenDayReturnRate: sevenDay,
        thirtyDayReturnRate: thirtyDay,
        avgProjectViews: average(idsInBucket, viewCountById),
        avgSearches: average(idsInBucket, searchCountById),
        avgSavedProjects: average(idsInBucket, savedProjectCountById),
        avgSavedSearches: average(idsInBucket, savedSearchCountById),
        avgContactEnquiries: average(idsInBucket, enquiryCountById),
      };
    })
  );
}
