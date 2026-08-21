import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AnalyticsPeriod } from "./period";

export interface EmailRecipientCandidate {
  id: string;
  name: string | null;
  email: string;
  newsletterOptedIn: boolean;
}

export interface EmailRecipientFilters {
  q?: string;
  /** "newsletter" | "saved_projects" — query-based segmentation, not a stored Segment entity (kept simple per Section 17's "prepare for, don't overbuild" guidance). */
  segment?: string;
  localityId?: string;
}

/** Search/filter over PublicUser for campaign recipient selection — deliberately separate from getRegisteredUsersPage (the admin Registered Users list), which isn't built for search/segment filtering and shouldn't be retrofitted for a different concern. */
export async function searchEmailRecipients(filters: EmailRecipientFilters, limit = 200): Promise<EmailRecipientCandidate[]> {
  const where: Prisma.PublicUserWhereInput = {};
  if (filters.q) {
    where.OR = [{ email: { contains: filters.q, mode: "insensitive" } }, { name: { contains: filters.q, mode: "insensitive" } }];
  }
  if (filters.segment === "newsletter") {
    where.newsletterSubscriptions = { some: { status: "SUBSCRIBED" } };
  } else if (filters.segment === "saved_projects") {
    where.savedProjects = { some: {} };
  }
  if (filters.localityId) {
    where.preferences = { preferredLocalityIds: { has: filters.localityId } };
  }

  const users = await prisma.publicUser.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, email: true, newsletterSubscriptions: { where: { status: "SUBSCRIBED" }, select: { status: true }, take: 1 } },
  });

  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, newsletterOptedIn: u.newsletterSubscriptions.length > 0 }));
}

export interface EmailCampaignSummary {
  id: string;
  type: string;
  subject: string;
  status: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  sentAt: Date | null;
  createdAt: Date;
  createdByUser: { name: string | null; email: string } | null;
}

export async function getEmailCampaigns(limit = 50, period?: AnalyticsPeriod): Promise<EmailCampaignSummary[]> {
  return prisma.emailCampaign.findMany({
    where: period ? { createdAt: { gte: period.since, lt: period.until } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      subject: true,
      status: true,
      recipientCount: true,
      successCount: true,
      failureCount: true,
      sentAt: true,
      createdAt: true,
      createdByUser: { select: { name: true, email: true } },
    },
  });
}

export interface EmailPeriodStats {
  campaignsInPeriod: number;
  previousCampaignsInPeriod: number;
  recipientsAcceptedInPeriod: number;
  recipientsFailedInPeriod: number;
}

/** Campaign-count and per-recipient accepted/failed totals for the selected period — reads EmailCampaignRecipient rows directly, not the campaign-level successCount/failureCount aggregate, so this reflects real per-recipient provider outcomes within the exact window (a campaign spanning a period boundary would otherwise misattribute its whole count to one bucket). */
export async function getEmailPeriodStats(period: AnalyticsPeriod): Promise<EmailPeriodStats> {
  const [campaignsInPeriod, previousCampaignsInPeriod, recipientsAcceptedInPeriod, recipientsFailedInPeriod] = await Promise.all([
    prisma.emailCampaign.count({ where: { createdAt: { gte: period.since, lt: period.until } } }),
    prisma.emailCampaign.count({ where: { createdAt: { gte: period.previousSince, lt: period.previousUntil } } }),
    prisma.emailCampaignRecipient.count({ where: { status: "ACCEPTED", sentAt: { gte: period.since, lt: period.until } } }),
    prisma.emailCampaignRecipient.count({ where: { status: "FAILED", campaign: { createdAt: { gte: period.since, lt: period.until } } } }),
  ]);
  return { campaignsInPeriod, previousCampaignsInPeriod, recipientsAcceptedInPeriod, recipientsFailedInPeriod };
}

export interface EmailCampaignDetailRecipient {
  id: string;
  email: string;
  status: string;
  sentAt: Date | null;
  providerMessageId: string | null;
  failureReason: string | null;
}

export interface EmailCampaignDetail {
  id: string;
  type: string;
  subject: string;
  bodyHtml: string;
  status: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  sentAt: Date | null;
  createdAt: Date;
  createdByUser: { name: string | null; email: string } | null;
  recipients: EmailCampaignDetailRecipient[];
}

/**
 * Full single-campaign view for the detail page: Overview (aggregate
 * counts, already on the campaign row), Recipient Details (every
 * EmailCampaignRecipient row -- real per-recipient provider outcome, never
 * "delivered" since no webhook exists), Content (subject/body), and
 * Audience is derived by the caller from the recipient list itself (no
 * separate "how were these selected" record is kept -- segmentation is
 * query-based at send time, not stored, per the existing design).
 */
export async function getEmailCampaignDetail(campaignId: string): Promise<EmailCampaignDetail | null> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      type: true,
      subject: true,
      bodyHtml: true,
      status: true,
      recipientCount: true,
      successCount: true,
      failureCount: true,
      sentAt: true,
      createdAt: true,
      createdByUser: { select: { name: true, email: true } },
      recipients: {
        select: { id: true, email: true, status: true, sentAt: true, providerMessageId: true, failureReason: true },
        orderBy: { email: "asc" },
      },
    },
  });
  return campaign;
}
