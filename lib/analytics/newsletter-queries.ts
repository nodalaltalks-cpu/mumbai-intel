import "server-only";
import { prisma } from "@/lib/prisma";
import { buildBuckets, countByBucket, type AnalyticsPeriod } from "./period";

export interface NewsletterSummary {
  totalSubscribers: number;
  newSubscribersInPeriod: number;
  previousNewSubscribersInPeriod: number;
}

/** totalSubscribers stays an all-time cumulative total; newSubscribersInPeriod is scoped to the selected period with a previous-period comparison. */
export async function getNewsletterSummary(period: AnalyticsPeriod): Promise<NewsletterSummary> {
  const [totalSubscribers, newSubscribersInPeriod, previousNewSubscribersInPeriod] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED" } }),
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED", subscribedAt: { gte: period.since, lt: period.until } } }),
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED", subscribedAt: { gte: period.previousSince, lt: period.previousUntil } } }),
  ]);
  return { totalSubscribers, newSubscribersInPeriod, previousNewSubscribersInPeriod };
}

export interface LatestSubscriber {
  id: string;
  email: string;
  status: string;
  subscribedAt: Date;
  updatedAt: Date;
  source: string | null;
  accountName: string | null;
  accountEmail: string | null;
  /** How many NewsletterSubscriber rows (distinct emails) share this same account — the "one user, many emails" count the founder asked to see. */
  subscriptionsForAccount: number;
}

/** Every subscriber, not just recent ones (Section 2: "Every newsletter subscription should be visible to Founder Admin") — capped at `limit` as a simple, sane ceiling rather than unpaginated. Includes unsubscribed rows too (status is shown per-row) so admin can see the full picture, not only active subscribers. */
export async function getAllSubscribers(limit = 200): Promise<LatestSubscriber[]> {
  const rows = await prisma.newsletterSubscriber.findMany({
    orderBy: { subscribedAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      status: true,
      subscribedAt: true,
      updatedAt: true,
      source: true,
      publicUserId: true,
      publicUser: { select: { name: true, email: true } },
    },
  });

  const accountIds = Array.from(new Set(rows.map((r) => r.publicUserId).filter((id): id is string => id !== null)));
  const countsByAccount = accountIds.length
    ? await prisma.newsletterSubscriber.groupBy({ by: ["publicUserId"], where: { publicUserId: { in: accountIds } }, _count: { _all: true } })
    : [];
  const countByAccountId = new Map(countsByAccount.map((c) => [c.publicUserId as string, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    subscribedAt: r.subscribedAt,
    updatedAt: r.updatedAt,
    source: r.source,
    accountName: r.publicUser?.name ?? null,
    accountEmail: r.publicUser?.email ?? null,
    subscriptionsForAccount: r.publicUserId ? (countByAccountId.get(r.publicUserId) ?? 1) : 0,
  }));
}

export interface SourceBreakdownPoint {
  source: string;
  count: number;
}

/** Which surfaces actually generate subscribers — grouped in JS since `source` is a free-form nullable string, not an enum with a fixed set the DB can group cleanly against for display labels. */
export async function getSourceBreakdown(): Promise<SourceBreakdownPoint[]> {
  const rows = await prisma.newsletterSubscriber.findMany({ where: { status: "SUBSCRIBED" }, select: { source: true } });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.source ?? "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

export interface SubscriberTrendPoint {
  label: string;
  count: number;
}

export async function getSubscriptionTrend(period: AnalyticsPeriod): Promise<SubscriberTrendPoint[]> {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { subscribedAt: { gte: period.since, lt: period.until } },
    select: { subscribedAt: true },
  });
  return countByBucket(rows.map((r) => r.subscribedAt), buildBuckets(period));
}
