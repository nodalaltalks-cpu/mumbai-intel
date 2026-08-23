"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { getPublicSession } from "@/lib/public-auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { searchNotificationRecipients, type NotificationRecipientCandidate, type NotificationRecipientFilters } from "@/lib/analytics/notification-queries";
import { friendlyPrismaError } from "./errors";
import type { NotificationCategory, Prisma } from "@prisma/client";

export async function searchNotificationRecipientsAction(filters: NotificationRecipientFilters): Promise<NotificationRecipientCandidate[]> {
  await requireAdminSession();
  return searchNotificationRecipients(filters);
}

export interface SendNotificationCampaignState {
  error?: string;
  success?: string;
  campaignId?: string;
}

function parseCampaignForm(formData: FormData): { error: string } | {
  category: NotificationCategory;
  customCategory: string | null;
  title: string;
  message: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
} {
  const category = formData.get("category") as NotificationCategory | null;
  const customCategoryRaw = (formData.get("customCategory") as string | null)?.trim() || null;
  const title = (formData.get("title") as string | null)?.trim();
  const message = (formData.get("message") as string | null)?.trim();
  const imageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
  const actionLabel = (formData.get("actionLabel") as string | null)?.trim() || null;
  const actionUrl = (formData.get("actionUrl") as string | null)?.trim() || null;

  if (!category) return { error: "Select a category" };
  if (category === "OTHER" && !customCategoryRaw) return { error: "Enter a name for this custom category" };
  if (!title) return { error: "Title is required" };
  if (!message) return { error: "Message is required" };
  if (actionUrl && !actionLabel) return { error: "Add a button label for the action URL" };
  if (actionLabel && !actionUrl) return { error: "Add a destination URL for the action button" };

  // Only meaningful (and only stored) for OTHER -- a stray value entered then abandoned in
  // favor of a fixed category shouldn't linger in the row.
  const customCategory = category === "OTHER" ? customCategoryRaw : null;

  return { category, customCategory, title, message, imageUrl, actionLabel, actionUrl };
}

/**
 * Creates the campaign and one real Notification row per recipient —
 * sequential creates, not createMany(), same reason as EmailCampaign
 * (lib/actions/email-campaigns.ts): the Neon HTTP adapter has no
 * transaction support and createMany() relies on one internally. Creation
 * itself IS delivery for an in-app notification (no separate provider
 * round-trip the way email has), so recipientCount === the real row count,
 * never a fabricated "sent" number ahead of the writes actually happening.
 */
export async function sendNotificationCampaignAction(_prevState: SendNotificationCampaignState, formData: FormData): Promise<SendNotificationCampaignState> {
  const session = await requireAdminSession();

  const parsed = parseCampaignForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const recipientIds = formData.getAll("recipientIds").map(String);
  if (recipientIds.length === 0) return { error: "Select at least one recipient" };

  const recipients = await prisma.publicUser.findMany({ where: { id: { in: recipientIds } }, select: { id: true } });
  if (recipients.length === 0) return { error: "No valid recipients found" };

  const targetFiltersRaw = formData.get("targetFilters") as string | null;
  let targetFilters: Prisma.InputJsonValue | undefined;
  if (targetFiltersRaw) {
    try {
      targetFilters = JSON.parse(targetFiltersRaw) as Prisma.InputJsonValue;
    } catch {
      targetFilters = undefined;
    }
  }

  try {
    const campaign = await prisma.notificationCampaign.create({
      data: {
        category: parsed.category,
        customCategory: parsed.customCategory,
        title: parsed.title,
        message: parsed.message,
        imageUrl: parsed.imageUrl,
        actionLabel: parsed.actionLabel,
        actionUrl: parsed.actionUrl,
        targetFilters,
        status: "SENDING",
        createdByUserId: session.userId,
        recipientCount: recipients.length,
      },
    });

    for (const r of recipients) {
      await prisma.notification.create({
        data: {
          type: "CAMPAIGN_ANNOUNCEMENT",
          title: parsed.title,
          body: parsed.message,
          imageUrl: parsed.imageUrl,
          actionLabel: parsed.actionLabel,
          actionUrl: parsed.actionUrl,
          recipientPublicUserId: r.id,
          campaignId: campaign.id,
          entityType: "NotificationCampaign",
          entityId: campaign.id,
        },
      });
    }

    await prisma.notificationCampaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentAt: new Date() } });
    await logAudit(session.userId, "notification_campaign.send", "NotificationCampaign", campaign.id, {
      after: { category: parsed.category, customCategory: parsed.customCategory, title: parsed.title, recipientCount: recipients.length },
    });

    revalidatePath("/admin/notifications");
    return { campaignId: campaign.id, success: `Sent to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.` };
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
}

export interface SendTestNotificationState {
  error?: string;
  success?: string;
}

/** Creates one real Notification targeted at the founder's own account — not a client-side mock, so Preview + Send Test together show exactly what a recipient will actually see. */
export async function sendTestNotificationAction(_prevState: SendTestNotificationState, formData: FormData): Promise<SendTestNotificationState> {
  const session = await requireAdminSession();
  const parsed = parseCampaignForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  // The founder testing from /admin has no PublicUser account by default -- route the test to
  // whichever PublicUser row shares their admin email, if one exists, since that's the one real
  // account we can safely attribute a test send to without inventing a recipient.
  const founderPublicAccount = await prisma.publicUser.findUnique({ where: { email: session.email }, select: { id: true } });
  if (!founderPublicAccount) {
    return { error: "No PublicUser account matches your admin email — sign up on the public site with the same email to receive test notifications." };
  }

  await prisma.notification.create({
    data: {
      type: "CAMPAIGN_ANNOUNCEMENT",
      title: `[TEST] ${parsed.title}`,
      body: parsed.message,
      imageUrl: parsed.imageUrl,
      actionLabel: parsed.actionLabel,
      actionUrl: parsed.actionUrl,
      recipientPublicUserId: founderPublicAccount.id,
      entityType: "NotificationCampaign",
    },
  });

  return { success: "Test notification sent to your account." };
}

/** Called when a recipient clicks a campaign notification's action button — records the click on the Notification row itself (for the campaign's Clicked count) and as a ResearchEvent (for the aggregate analytics stream), from the one place this happens. */
export async function recordNotificationClickAction(notificationId: string): Promise<void> {
  const session = await getPublicSession();
  if (!session) return;
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientPublicUserId: session.userId },
    select: { id: true, clickedAt: true, campaignId: true },
  });
  if (!notification || notification.clickedAt) return;

  await prisma.notification.update({ where: { id: notification.id }, data: { clickedAt: new Date() } });
  await recordResearchEvent("NOTIFICATION_CLICKED", notification.campaignId ? { metadata: { campaignId: notification.campaignId } } : {});
}
