import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/guard";
import { getEmailCampaignDetail } from "@/lib/analytics/email-queries";
import { formatDateTime } from "@/lib/format";
import BackButton from "@/app/admin/components/BackButton";
import DeleteCampaignButton from "@/app/admin/components/DeleteCampaignButton";

export const metadata: Metadata = { title: "Campaign — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  NEWSLETTER: "Newsletter",
  RESEARCH_UPDATE: "Research / Market Update",
  MARKET_REPORT: "Transaction / Market Report",
  PRODUCT_COMMUNICATION: "Product Communication",
  REPORT_COMMUNICATION: "Report Communication",
};

const RECIPIENT_STATUS_CLASS: Record<string, string> = {
  PENDING: "border-border bg-surface-raised text-muted",
  ACCEPTED: "border-positive/40 bg-positive/10 text-positive",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  const { id } = await params;
  const campaign = await getEmailCampaignDetail(id);
  if (!campaign) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <BackButton fallbackHref="/admin/email" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">{campaign.subject}</h1>
          <p className="text-xs text-muted">
            {TYPE_LABEL[campaign.type] ?? campaign.type} · Created by {campaign.createdByUser?.name ?? campaign.createdByUser?.email ?? "--"}
          </p>
        </div>
        {session.role === "ADMIN" ? <DeleteCampaignButton campaignId={campaign.id} subject={campaign.subject} /> : null}
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Campaign Overview</h2>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div><dt className="text-muted">Status</dt><dd className="font-mono text-foreground">{campaign.status}</dd></div>
          <div><dt className="text-muted">Created</dt><dd className="font-mono text-foreground">{formatDateTime(campaign.createdAt)}</dd></div>
          <div><dt className="text-muted">Sent</dt><dd className="font-mono text-foreground">{campaign.sentAt ? formatDateTime(campaign.sentAt) : "--"}</dd></div>
          <div><dt className="text-muted">Recipients</dt><dd className="font-mono text-foreground">{campaign.recipientCount}</dd></div>
          <div><dt className="text-muted">Accepted by provider</dt><dd className="font-mono text-positive">{campaign.successCount}</dd></div>
          <div><dt className="text-muted">Failed</dt><dd className="font-mono text-negative">{campaign.failureCount}</dd></div>
          <div><dt className="text-muted">Delivered</dt><dd className="font-mono text-muted">Not tracked</dd></div>
          <div><dt className="text-muted">Bounced</dt><dd className="font-mono text-muted">Not tracked</dd></div>
          <div><dt className="text-muted">Opened / Clicked</dt><dd className="font-mono text-muted">Not tracked</dd></div>
        </dl>
        <p className="mt-3 text-[10px] text-muted">
          "Accepted by provider" means Resend&apos;s API took the send request — it is not proof of delivery. Delivery/bounce/open/click tracking
          requires a Resend webhook, which isn&apos;t wired up yet.
        </p>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Content</h2>
        <p className="text-xs text-foreground">
          <span className="text-muted">Subject: </span>
          {campaign.subject}
        </p>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-border bg-background p-3 text-xs text-foreground" dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }} />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">Audience</h2>
        <p className="mb-3 text-[11px] text-muted">
          Recipients are selected by search/segment filters at send time, not stored as a saved definition — the {campaign.recipientCount} rows below are
          exactly who this campaign went to.
        </p>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Recipient Details</h2>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Sent</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-foreground">{r.email}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${RECIPIENT_STATUS_CLASS[r.status] ?? ""}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.sentAt ? formatDateTime(r.sentAt) : "--"}</td>
                  <td className="px-3 py-2 text-muted">{r.failureReason ?? (r.providerMessageId ? `Provider ID: ${r.providerMessageId}` : "--")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
