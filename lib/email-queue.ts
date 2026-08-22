import "server-only";
import { prisma } from "@/lib/prisma";
import { sendCampaignEmail } from "@/lib/email";
import type { EmailCampaignStatus } from "@prisma/client";

/** No throttling infrastructure existed before this — Resend's free tier is roughly 1 email/sec, so a simple fixed delay between sequential sends is the minimum viable guard. */
const SEND_DELAY_MS = 350;

/**
 * Recipients processed per drainCampaignQueue call. At SEND_DELAY_MS
 * throttle plus realistic SMTP round-trip latency, this comfortably clears
 * in well under Vercel's 300s function timeout for a single invocation
 * (roughly ~150 recipients/minute), while still bounding one request's
 * worst case for a very large list — callers loop this until nothing's
 * left PENDING or a founder revisits later.
 */
const BATCH_SIZE = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DrainResult {
  error?: string;
  sent?: number;
  failed?: number;
  remaining?: number;
  status?: string;
}

/**
 * Core queue-drain logic, deliberately NOT exported from a "use server"
 * actions file — every export of a "use server" module becomes a
 * client-callable endpoint, and this has no session check of its own (the
 * daily cron safety net authenticates via CRON_SECRET instead, not an admin
 * session). lib/actions/email-campaigns.ts's processCampaignQueueAction
 * wraps this with requireAdminSession() for the UI-triggered path; the cron
 * route (app/api/cron/email-queue-drain) calls this directly.
 */
export async function drainCampaignQueue(campaignId: string): Promise<DrainResult> {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { subject: true, bodyHtml: true, status: true } });
  if (!campaign) return { error: "Campaign not found" };
  if (campaign.status === "SENT" || campaign.status === "FAILED") return { sent: 0, failed: 0, remaining: 0, status: campaign.status };

  const pending = await prisma.emailCampaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    take: BATCH_SIZE,
    orderBy: { id: "asc" },
  });

  if (pending.length > 0 && campaign.status === "QUEUED") {
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
  }

  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    // sendCampaignEmail reports what the SMTP server actually returned — "ACCEPTED" means
    // the provider took the send request, never that it was delivered (no webhook exists
    // to confirm that). A failure here always carries the real provider/config error, never
    // a generic placeholder, so the admin can see exactly why a recipient didn't go out.
    let result: { ok: boolean; providerMessageId?: string; error?: string };
    try {
      result = await sendCampaignEmail(row.email, campaign.subject, campaign.bodyHtml);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "Unexpected send error" };
    }
    if (result.ok) {
      sent += 1;
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: { status: "ACCEPTED", sentAt: new Date(), providerMessageId: result.providerMessageId ?? null },
      });
    } else {
      failed += 1;
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: { status: "FAILED", failureReason: result.error ?? "Send failed" },
      });
    }
    await sleep(SEND_DELAY_MS);
  }

  const remaining = await prisma.emailCampaignRecipient.count({ where: { campaignId, status: "PENDING" } });
  let status: EmailCampaignStatus = campaign.status === "QUEUED" && pending.length > 0 ? "SENDING" : campaign.status;
  if (remaining === 0 && pending.length > 0) {
    const [successCount, failureCount] = await Promise.all([
      prisma.emailCampaignRecipient.count({ where: { campaignId, status: "ACCEPTED" } }),
      prisma.emailCampaignRecipient.count({ where: { campaignId, status: "FAILED" } }),
    ]);
    status = successCount === 0 && failureCount > 0 ? "FAILED" : "SENT";
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status, successCount, failureCount, sentAt: new Date() } });
  }

  return { sent, failed, remaining, status };
}
