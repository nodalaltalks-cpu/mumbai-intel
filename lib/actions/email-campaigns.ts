"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { sendCampaignEmail } from "@/lib/email";
import { searchEmailRecipients, type EmailRecipientCandidate, type EmailRecipientFilters } from "@/lib/analytics/email-queries";
import type { EmailCampaignType } from "@prisma/client";

export async function searchRecipientsAction(filters: EmailRecipientFilters): Promise<EmailRecipientCandidate[]> {
  await requireAdminSession();
  return searchEmailRecipients(filters);
}

export interface SendCampaignState {
  error?: string;
  success?: string;
}

/** No throttling infrastructure existed before this — Resend's free tier is roughly 1 email/sec, so a simple fixed delay between sequential sends is the minimum viable guard. */
const SEND_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends an admin-composed campaign to the selected PublicUsers, reusing the
 * existing Resend wrapper (lib/email.ts) — no new provider. Individual
 * sequential create()/update() calls throughout, not createMany() -- the
 * Neon HTTP adapter has no transaction support and createMany() relies on
 * one internally (same constraint already worked around elsewhere in this
 * codebase, see syncProjectAmenities).
 */
export async function sendCampaignAction(_prevState: SendCampaignState, formData: FormData): Promise<SendCampaignState> {
  const session = await requireAdminSession();

  const type = formData.get("type") as EmailCampaignType | null;
  const subject = (formData.get("subject") as string | null)?.trim();
  const bodyHtml = (formData.get("bodyHtml") as string | null)?.trim();
  const recipientIds = formData.getAll("recipientIds").map(String);

  if (!type) return { error: "Select a campaign type" };
  if (!subject) return { error: "Subject is required" };
  if (!bodyHtml || bodyHtml === "<p></p>") return { error: "Body is required" };
  if (recipientIds.length === 0) return { error: "Select at least one recipient" };

  const recipients = await prisma.publicUser.findMany({ where: { id: { in: recipientIds } }, select: { id: true, email: true } });
  if (recipients.length === 0) return { error: "No valid recipients found" };

  const campaign = await prisma.emailCampaign.create({
    data: { type, subject, bodyHtml, status: "SENDING", createdByUserId: session.userId, recipientCount: recipients.length },
  });

  const recipientRows: { id: string; email: string }[] = [];
  for (const r of recipients) {
    const row = await prisma.emailCampaignRecipient.create({
      data: { campaignId: campaign.id, publicUserId: r.id, email: r.email, status: "PENDING" },
    });
    recipientRows.push({ id: row.id, email: r.email });
  }

  let successCount = 0;
  let failureCount = 0;
  for (const row of recipientRows) {
    let sent = false;
    try {
      sent = await sendCampaignEmail(row.email, subject, bodyHtml);
    } catch (error) {
      console.error("[email-campaigns] send failed for", row.email, error);
    }
    if (sent) {
      successCount += 1;
      await prisma.emailCampaignRecipient.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
    } else {
      failureCount += 1;
      await prisma.emailCampaignRecipient.update({ where: { id: row.id }, data: { status: "FAILED", failureReason: "Send failed" } });
    }
    await sleep(SEND_DELAY_MS);
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: failureCount === recipientRows.length ? "FAILED" : "SENT", successCount, failureCount, sentAt: new Date() },
  });

  revalidatePath("/admin/email");
  return { success: `Sent to ${successCount} of ${recipientRows.length} recipient${recipientRows.length === 1 ? "" : "s"}${failureCount > 0 ? ` (${failureCount} failed)` : ""}.` };
}
