import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AnalyticsPeriod } from "./period";

/**
 * Same recency threshold the Registered Users page already uses to label a
 * user "Inactive" (lib/admin-queries.ts's activityFromLastActive) — reused
 * here rather than re-defined, so "Active users" in a notification campaign
 * means the same thing it does everywhere else in the admin.
 */
const ACTIVE_WINDOW_DAYS = 30;
/** "New user" window — matches getUserGrowthStats' newLast30d bucket. */
const NEW_USER_WINDOW_DAYS = 30;

export type NotificationSegment =
  | "all"
  | "new"
  | "active"
  | "inactive"
  | "locality"
  | "saved_project"
  | "saved_search"
  | "profile_complete"
  | "profile_incomplete"
  | "notifications_enabled"
  | "specific";

export interface NotificationRecipientFilters {
  q?: string;
  segment?: NotificationSegment;
  /** Scopes the "locality" segment (or narrows any other segment further) to one locality. */
  localityId?: string;
  /** Scopes the "saved_project" segment to users who saved this specific project, not just any project. */
  projectId?: string;
  city?: string;
  /** A PropertyCategory value from UserPreferences.preferredCategories. */
  category?: string;
  budgetMinRupees?: number;
  budgetMaxRupees?: number;
  /** Only used with segment "specific". */
  userIds?: string[];
}

export interface NotificationRecipientCandidate {
  id: string;
  name: string | null;
  email: string;
  city: string | null;
  lastActiveAt: Date | null;
  notificationsEnabled: boolean;
}

function activeSinceDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Real, stored-field-only targeting for a founder notification campaign
 * (Section 3) — every segment here maps directly to an existing PublicUser/
 * UserPreferences/ResearchEvent/SavedProject/SavedSearch column, nothing
 * invented. Mirrors searchEmailRecipients' shape (lib/analytics/email-queries.ts)
 * but scoped to what an in-platform notification, not an email, needs.
 */
export async function searchNotificationRecipients(filters: NotificationRecipientFilters, limit = 500): Promise<NotificationRecipientCandidate[]> {
  const where: Prisma.PublicUserWhereInput = {};
  const and: Prisma.PublicUserWhereInput[] = [];

  if (filters.q) {
    and.push({ OR: [{ email: { contains: filters.q, mode: "insensitive" } }, { name: { contains: filters.q, mode: "insensitive" } }] });
  }

  switch (filters.segment) {
    case "new":
      and.push({ createdAt: { gte: activeSinceDate(NEW_USER_WINDOW_DAYS) } });
      break;
    case "active":
      and.push({ researchEvents: { some: { createdAt: { gte: activeSinceDate(ACTIVE_WINDOW_DAYS) } } } });
      break;
    case "inactive":
      and.push({ researchEvents: { none: { createdAt: { gte: activeSinceDate(ACTIVE_WINDOW_DAYS) } } } });
      break;
    case "locality":
      if (filters.localityId) {
        and.push({ preferences: { preferredLocalityIds: { has: filters.localityId } } });
      }
      break;
    case "saved_project":
      and.push({ savedProjects: filters.projectId ? { some: { projectId: filters.projectId } } : { some: {} } });
      break;
    case "saved_search":
      and.push({ savedSearches: { some: {} } });
      break;
    case "profile_complete":
      and.push({ profileCompletionPercent: { gte: 100 } });
      break;
    case "profile_incomplete":
      and.push({ profileCompletionPercent: { lt: 100 } });
      break;
    case "notifications_enabled":
      and.push({ notificationPreferences: { productUpdates: true } });
      break;
    case "specific":
      // If explicit ids were passed, narrow to exactly those. Otherwise "specific" relies entirely
      // on the free-text `q` filter already applied above -- there's no separate id list from the
      // composer UI, which just lets the founder search-and-check names/emails directly.
      if (filters.userIds && filters.userIds.length > 0) and.push({ id: { in: filters.userIds } });
      break;
    case "all":
    default:
      break;
  }

  // Additional narrowing filters, independent of segment — a founder can e.g. pick "Active users" AND a city together.
  if (filters.localityId && filters.segment !== "locality") {
    and.push({ preferences: { preferredLocalityIds: { has: filters.localityId } } });
  }
  if (filters.city) and.push({ city: { equals: filters.city, mode: "insensitive" } });
  if (filters.category) and.push({ preferences: { preferredCategories: { has: filters.category } } });
  if (filters.budgetMinRupees !== undefined) and.push({ preferences: { preferredBudgetMaxRupees: { gte: filters.budgetMinRupees } } });
  if (filters.budgetMaxRupees !== undefined) and.push({ preferences: { preferredBudgetMinRupees: { lte: filters.budgetMaxRupees } } });

  if (and.length > 0) where.AND = and;

  const users = await prisma.publicUser.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      city: true,
      notificationPreferences: { select: { productUpdates: true } },
      researchEvents: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    city: u.city,
    lastActiveAt: u.researchEvents[0]?.createdAt ?? null,
    notificationsEnabled: u.notificationPreferences?.productUpdates ?? false,
  }));
}

export interface NotificationCampaignSummary {
  id: string;
  category: string;
  title: string;
  status: string;
  recipientCount: number;
  createdAt: Date;
  sentAt: Date | null;
  createdByUser: { name: string | null; email: string } | null;
}

/** Permanent campaign history (Section 5) — every send stays listed, nothing is pruned when a campaign finishes. */
export async function getNotificationCampaigns(limit = 50): Promise<NotificationCampaignSummary[]> {
  return prisma.notificationCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      category: true,
      title: true,
      status: true,
      recipientCount: true,
      createdAt: true,
      sentAt: true,
      createdByUser: { select: { name: true, email: true } },
    },
  });
}

export interface NotificationCampaignRecipientRow {
  id: string;
  email: string;
  readAt: Date | null;
  clickedAt: Date | null;
  createdAt: Date;
}

export interface NotificationCampaignDetail {
  id: string;
  category: string;
  title: string;
  message: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  status: string;
  recipientCount: number;
  readCount: number;
  clickedCount: number;
  createdAt: Date;
  sentAt: Date | null;
  createdByUser: { name: string | null; email: string } | null;
  recipients: NotificationCampaignRecipientRow[];
}

/**
 * Real performance only (Section 5: "Do not create fake delivery/read
 * numbers") — Sent === recipientCount (creating the Notification row IS
 * delivery for an in-app notification, no separate provider step), Read/
 * Clicked are counted live from the actual Notification rows' readAt/
 * clickedAt rather than trusting a stored counter that could drift.
 */
export async function getNotificationCampaignDetail(campaignId: string): Promise<NotificationCampaignDetail | null> {
  const campaign = await prisma.notificationCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      category: true,
      title: true,
      message: true,
      imageUrl: true,
      actionLabel: true,
      actionUrl: true,
      status: true,
      recipientCount: true,
      createdAt: true,
      sentAt: true,
      createdByUser: { select: { name: true, email: true } },
      notifications: {
        select: { id: true, readAt: true, clickedAt: true, createdAt: true, recipientPublicUser: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!campaign) return null;

  const { notifications, ...rest } = campaign;
  return {
    ...rest,
    readCount: notifications.filter((n) => n.readAt).length,
    clickedCount: notifications.filter((n) => n.clickedAt).length,
    recipients: notifications.map((n) => ({
      id: n.id,
      email: n.recipientPublicUser?.email ?? "--",
      readAt: n.readAt,
      clickedAt: n.clickedAt,
      createdAt: n.createdAt,
    })),
  };
}

export interface NotificationAnalyticsOverview {
  campaignsInPeriod: number;
  sent: number;
  read: number;
  clicked: number;
  readRate: number | null;
  clickRate: number | null;
  byCategory: { category: string; sent: number; read: number; clicked: number }[];
}

/**
 * Section 6's requested events (notification_sent/seen/clicked/marked_read)
 * are already real, queryable state, not a separate event log to build:
 * "sent" is the Notification row existing, "marked_read"/"seen" is readAt,
 * "clicked" is clickedAt (plus the matching NOTIFICATION_CLICKED
 * ResearchEvent for the aggregate analytics stream). This aggregates those
 * same columns across every campaign in the period, rather than standing up
 * a duplicate counter system.
 */
export async function getNotificationAnalyticsOverview(period: AnalyticsPeriod): Promise<NotificationAnalyticsOverview> {
  // `until` is "now" for every non-custom period. Filtering that upper bound in the DB query
  // (createdAt: { lt: until }) was observed, during verification, to unreliably include rows
  // newer than `until` when `until` is very close to the current moment -- reproduced with a
  // fresh PrismaClient/PrismaNeonHttp instance, so it isn't request-level caching. Only `since`
  // (always well in the past) goes into the query; `until` is applied in JS instead, same as the
  // campaign-history list on the Notifications page already does.
  const notificationsSinceStart = await prisma.notification.findMany({
    where: { campaignId: { not: null }, createdAt: { gte: period.since } },
    select: { readAt: true, clickedAt: true, createdAt: true, campaign: { select: { id: true, category: true } } },
  });
  const notifications = notificationsSinceStart.filter((n) => n.createdAt < period.until);

  const campaignIds = new Set(notifications.map((n) => n.campaign?.id).filter((id): id is string => Boolean(id)));
  const sent = notifications.length;
  const read = notifications.filter((n) => n.readAt).length;
  const clicked = notifications.filter((n) => n.clickedAt).length;

  const byCategoryMap = new Map<string, { sent: number; read: number; clicked: number }>();
  for (const n of notifications) {
    const category = n.campaign?.category ?? "GENERAL_UPDATE";
    const entry = byCategoryMap.get(category) ?? { sent: 0, read: 0, clicked: 0 };
    entry.sent += 1;
    if (n.readAt) entry.read += 1;
    if (n.clickedAt) entry.clicked += 1;
    byCategoryMap.set(category, entry);
  }

  return {
    campaignsInPeriod: campaignIds.size,
    sent,
    read,
    clicked,
    readRate: sent > 0 ? Math.round((read / sent) * 1000) / 10 : null,
    clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : null,
    byCategory: Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.sent - a.sent),
  };
}
