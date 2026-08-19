import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
    where.newsletterSubscription = { status: "SUBSCRIBED" };
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
    select: { id: true, name: true, email: true, newsletterSubscription: { select: { status: true } } },
  });

  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, newsletterOptedIn: u.newsletterSubscription?.status === "SUBSCRIBED" }));
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

export async function getEmailCampaigns(limit = 50): Promise<EmailCampaignSummary[]> {
  return prisma.emailCampaign.findMany({
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
