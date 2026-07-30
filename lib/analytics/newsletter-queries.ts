import "server-only";
import { prisma } from "@/lib/prisma";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export interface NewsletterSummary {
  totalSubscribers: number;
  subscribersToday: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
}

export async function getNewsletterSummary(): Promise<NewsletterSummary> {
  const now = new Date();
  const [totalSubscribers, subscribersToday, weeklyGrowth, monthlyGrowth] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED" } }),
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED", subscribedAt: { gte: startOfDay(now) } } }),
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED", subscribedAt: { gte: daysAgo(7) } } }),
    prisma.newsletterSubscriber.count({ where: { status: "SUBSCRIBED", subscribedAt: { gte: daysAgo(30) } } }),
  ]);
  return { totalSubscribers, subscribersToday, weeklyGrowth, monthlyGrowth };
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

export interface DailySubscriberPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export async function getSubscriptionTrend(days = 30): Promise<DailySubscriberPoint[]> {
  const since = daysAgo(days - 1);
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { subscribedAt: { gte: since } },
    select: { subscribedAt: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.subscribedAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
