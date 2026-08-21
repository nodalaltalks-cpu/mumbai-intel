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
  subscribedAt: Date;
  source: string | null;
}

export async function getLatestSubscribers(limit = 10): Promise<LatestSubscriber[]> {
  return prisma.newsletterSubscriber.findMany({
    where: { status: "SUBSCRIBED" },
    orderBy: { subscribedAt: "desc" },
    take: limit,
    select: { id: true, email: true, subscribedAt: true, source: true },
  });
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
