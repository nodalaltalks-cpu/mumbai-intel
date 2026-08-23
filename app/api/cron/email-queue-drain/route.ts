import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { drainCampaignQueue } from "@/lib/email-queue";
import { verifyCronSecret } from "@/lib/verify-cron-secret";

/**
 * Safety net, not the primary send path — EmailComposer auto-drains a
 * campaign's queue immediately after creation (app/admin/components/
 * EmailComposer.tsx), and the campaign detail page offers a manual
 * "Continue sending" button for anything left over. This daily cron only
 * catches a campaign left stuck QUEUED/SENDING with PENDING recipients
 * (e.g. the founder closed the tab mid-send on a very large list) — daily
 * is deliberate, since Vercel's Hobby tier caps cron frequency at once a
 * day, and this path exists purely so nothing gets silently abandoned, not
 * to be the timely delivery mechanism.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stuckCampaigns = await prisma.emailCampaign.findMany({
    where: { status: { in: ["QUEUED", "SENDING"] }, recipients: { some: { status: "PENDING" } } },
    select: { id: true },
  });

  const results = [];
  for (const campaign of stuckCampaigns) {
    const result = await drainCampaignQueue(campaign.id);
    results.push({ campaignId: campaign.id, ...result });
  }

  return NextResponse.json({ processed: results.length, results });
}
