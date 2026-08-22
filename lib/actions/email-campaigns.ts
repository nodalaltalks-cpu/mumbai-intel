"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { sendCampaignEmail } from "@/lib/email";
import { drainCampaignQueue } from "@/lib/email-queue";
import { requireTrashReauth } from "@/lib/auth/trash-reauth";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/actions/errors";
import {
  searchEmailRecipients,
  filterEligibleForMarketing,
  requiresMarketingConsent,
  type EmailRecipientCandidate,
  type EmailRecipientFilters,
} from "@/lib/analytics/email-queries";
import type { EmailCampaignType } from "@prisma/client";

export async function searchRecipientsAction(filters: EmailRecipientFilters): Promise<EmailRecipientCandidate[]> {
  await requireAdminSession();
  return searchEmailRecipients(filters);
}

export interface SendCampaignState {
  error?: string;
  success?: string;
  campaignId?: string;
}

/**
 * Creates the campaign and queues one EmailCampaignRecipient row per
 * eligible recipient (Section 13: created → recipients selected → queued →
 * sending → sent/failed) — this action no longer sends synchronously.
 * processCampaignQueueAction below does the actual sending, in batches, so a
 * large recipient list can't blow past a single request's time budget.
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

  const requested = await prisma.publicUser.findMany({ where: { id: { in: recipientIds } }, select: { id: true, email: true } });
  if (requested.length === 0) return { error: "No valid recipients found" };

  // Section 12: marketing-type campaigns can only go to users who actually opted in —
  // enforced here, at send time, regardless of what the recipient picker showed, so this
  // can never be bypassed by a stale/wide picker selection.
  let eligible = requested;
  let excludedForConsent = 0;
  if (requiresMarketingConsent(type)) {
    const eligibleIds = await filterEligibleForMarketing(requested.map((r) => r.id));
    eligible = requested.filter((r) => eligibleIds.has(r.id));
    excludedForConsent = requested.length - eligible.length;
  }
  if (eligible.length === 0) {
    return { error: "None of the selected recipients are eligible for this campaign type (no marketing consent on file)." };
  }

  const campaign = await prisma.emailCampaign.create({
    data: { type, subject, bodyHtml, status: "QUEUED", createdByUserId: session.userId, recipientCount: eligible.length },
  });

  // Individual sequential create() calls, not createMany() -- the Neon HTTP adapter has no
  // transaction support and createMany() relies on one internally (same constraint already
  // worked around elsewhere in this codebase, see syncProjectAmenities).
  for (const r of eligible) {
    await prisma.emailCampaignRecipient.create({
      data: { campaignId: campaign.id, publicUserId: r.id, email: r.email, status: "PENDING" },
    });
  }

  await logAudit(session.userId, "email_campaign.queue", "EmailCampaign", campaign.id, {
    after: { type, subject, recipientCount: eligible.length, excludedForConsent },
  });

  revalidatePath("/admin/email");
  return {
    campaignId: campaign.id,
    success:
      `Queued ${eligible.length} recipient${eligible.length === 1 ? "" : "s"}.` +
      (excludedForConsent > 0 ? ` ${excludedForConsent} excluded — not eligible for marketing email.` : "") +
      " Sending now…",
  };
}

/**
 * Sends up to BATCH_SIZE still-PENDING recipients for a campaign, then
 * finalizes the campaign's status once nothing is left PENDING. Called
 * repeatedly by EmailComposer right after a campaign is queued (so sending
 * still starts immediately, same as before), by the "Continue sending"
 * button on the campaign detail page for anything left over, and by the
 * daily cron safety-net (app/api/cron/email-queue-drain) for anything
 * abandoned mid-send.
 */
export async function processCampaignQueueAction(
  campaignId: string
): Promise<{ error?: string; sent?: number; failed?: number; remaining?: number; status?: string }> {
  await requireAdminSession();
  const result = await drainCampaignQueue(campaignId);
  revalidatePath("/admin/email");
  revalidatePath(`/admin/email/${campaignId}`);
  return result;
}

export interface SendTestEmailResult {
  error?: string;
  success?: string;
}

/** Fires one real send through the exact same transport a campaign would use, to a single address, with no EmailCampaign/EmailCampaignRecipient rows created — Section 11's "Send test email" gate before a real campaign send is allowed. */
export async function sendTestEmailAction(testEmail: string, subject: string, bodyHtml: string): Promise<SendTestEmailResult> {
  await requireAdminSession();
  if (!testEmail?.trim()) return { error: "Enter an email address to send the test to" };
  if (!subject?.trim()) return { error: "Subject is required" };
  if (!bodyHtml?.trim() || bodyHtml === "<p></p>") return { error: "Body is required" };

  const result = await sendCampaignEmail(testEmail.trim(), `[TEST] ${subject}`, bodyHtml);
  if (!result.ok) return { error: result.error ?? "Send failed" };
  return { success: `Test email accepted by the mail server for ${testEmail.trim()}.` };
}

// ─────────────────────────────────────────────────────────────────────────
// Trash (Section 15) — campaign records used to be hard-deleted; this is now
// the same soft-delete → Trash → restore → permanent-delete shape already
// proven for Project/Builder/Locality/Transaction.
// ─────────────────────────────────────────────────────────────────────────

export async function trashCampaignAction(campaignId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) return { error: "Campaign not found — it may have already been deleted." };

  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { deletedAt: new Date(), deletedByUserId: session.userId } });
  await logAudit(session.userId, "email_campaign.trash", "EmailCampaign", campaignId);
  revalidatePath("/admin/email");
  return {};
}

export async function restoreCampaignAction(campaignId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { deletedAt: true } });
  if (!campaign) return { error: "Campaign not found" };
  if (!campaign.deletedAt) return { error: "This campaign isn't in Trash" };

  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "email_campaign.restore", "EmailCampaign", campaignId);
  revalidatePath("/admin/trash");
  revalidatePath("/admin/email");
  return {};
}

/**
 * Permanently deletes a campaign record and its EmailCampaignRecipient rows
 * (cascade, per the schema's onDelete: Cascade on that relation) -- never
 * touches PublicUser accounts, which only reference recipients by a nullable
 * FK (onDelete: SetNull). Irreversible, so it's gated behind both ADMIN role
 * and Trash re-authentication (Section 19), on top of requiring the record
 * to already be in Trash.
 */
export async function permanentlyDeleteCampaignAction(campaignId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }

  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { subject: true, type: true, status: true, recipientCount: true, successCount: true, failureCount: true, deletedAt: true },
    });
    if (!campaign) return { error: "Campaign not found — it may have already been deleted." };
    if (!campaign.deletedAt) return { error: "Move this campaign to Trash before permanently deleting it" };
    await logAudit(session.userId, "email_campaign.permanent-delete", "EmailCampaign", campaignId, { before: campaign });
    await prisma.emailCampaign.delete({ where: { id: campaignId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidatePath("/admin/trash");
  return {};
}

export async function bulkCampaignTrashAction(
  campaignIds: string[],
  operation: "restore" | "permanent-delete"
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (campaignIds.length === 0) return { error: "No campaigns selected" };
  if (operation === "permanent-delete") {
    try {
      await requireTrashReauth(session.userId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Re-authentication required" };
    }
  }

  const trashed = await prisma.emailCampaign.findMany({ where: { id: { in: campaignIds }, deletedAt: { not: null } }, select: { id: true } });
  let affected = 0;
  if (operation === "restore") {
    for (const c of trashed) {
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { deletedAt: null, deletedByUserId: null } });
    }
    affected = trashed.length;
  } else {
    for (const c of trashed) {
      await prisma.emailCampaign.delete({ where: { id: c.id } });
    }
    affected = trashed.length;
  }

  await logAudit(session.userId, `email_campaign.bulk.${operation}`, "EmailCampaign", campaignIds.join(","));
  revalidatePath("/admin/trash");
  revalidatePath("/admin/email");
  return { affected };
}

export async function emptyCampaignTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }

  const trashed = await prisma.emailCampaign.findMany({ where: { deletedAt: { not: null } }, select: { id: true } });
  for (const c of trashed) {
    await prisma.emailCampaign.delete({ where: { id: c.id } });
  }
  await logAudit(session.userId, "email_campaign.trash.empty", "EmailCampaign", "bulk");
  revalidatePath("/admin/trash");
  return { affected: trashed.length };
}
