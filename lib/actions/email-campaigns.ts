"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { sendCampaignEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/actions/errors";
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
    // sendCampaignEmail reports what Resend's API actually returned — "ACCEPTED" means
    // the provider took the send request, never that it was delivered (no webhook exists
    // to confirm that). A failure here always carries the real provider/config error, never
    // a generic placeholder, so the admin can see exactly why a recipient didn't go out.
    let result: { ok: boolean; providerMessageId?: string; error?: string };
    try {
      result = await sendCampaignEmail(row.email, subject, bodyHtml);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "Unexpected send error" };
    }
    if (result.ok) {
      successCount += 1;
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: { status: "ACCEPTED", sentAt: new Date(), providerMessageId: result.providerMessageId ?? null },
      });
    } else {
      failureCount += 1;
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: { status: "FAILED", failureReason: result.error ?? "Send failed" },
      });
    }
    await sleep(SEND_DELAY_MS);
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: failureCount === recipientRows.length ? "FAILED" : "SENT", successCount, failureCount, sentAt: new Date() },
  });

  revalidatePath("/admin/email");
  return {
    success: `Accepted by provider for ${successCount} of ${recipientRows.length} recipient${recipientRows.length === 1 ? "" : "s"}${failureCount > 0 ? ` (${failureCount} failed)` : ""}. This confirms the provider accepted the send, not that it was delivered.`,
  };
}

/**
 * Permanently deletes a campaign record and its EmailCampaignRecipient rows
 * (cascade, per the schema's onDelete: Cascade on that relation) -- never
 * touches PublicUser accounts, which only reference recipients by a nullable
 * FK (onDelete: SetNull). ADMIN-only, matches deleteReportAction's pattern:
 * audit-log the campaign's identifying details before deleting, since
 * nothing else holds a real foreign key to EmailCampaign to make deletion
 * unsafe.
 */
export async function deleteCampaignAction(campaignId: string): Promise<{ error?: string }> {
  try {
    const session = await requireAdminSession();
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { subject: true, type: true, status: true, recipientCount: true, successCount: true, failureCount: true },
    });
    if (!campaign) return { error: "Campaign not found — it may have already been deleted." };
    await logAudit(session.userId, "email_campaign.delete", "EmailCampaign", campaignId, { before: campaign });
    await prisma.emailCampaign.delete({ where: { id: campaignId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/email");
  return {};
}
