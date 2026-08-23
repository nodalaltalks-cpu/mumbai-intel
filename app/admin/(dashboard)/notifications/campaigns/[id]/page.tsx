import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/guard";
import { getNotificationCampaignDetail } from "@/lib/analytics/notification-queries";
import { formatDateTime } from "@/lib/format";
import { formatNotificationCategory } from "@/lib/notification-category-label";
import BackButton from "@/app/admin/components/BackButton";

export const metadata: Metadata = { title: "Notification Campaign — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NotificationCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  const campaign = await getNotificationCampaignDetail(id);
  if (!campaign) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <BackButton fallbackHref="/admin/notifications" />

      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">{campaign.title}</h1>
        <p className="text-xs text-muted">
          {formatNotificationCategory(campaign.category, campaign.customCategory)} · Created by {campaign.createdByUser?.name ?? campaign.createdByUser?.email ?? "--"}
        </p>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Performance</h2>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Recipients</dt>
            <dd className="font-mono text-foreground">{campaign.recipientCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Sent</dt>
            <dd className="font-mono text-foreground">{campaign.recipientCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Read</dt>
            <dd className="font-mono text-positive">{campaign.readCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Clicked</dt>
            <dd className="font-mono text-accent">{campaign.clickedCount}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[10px] text-muted">
          &quot;Sent&quot; is the number of Notification rows actually created — creation is delivery for an in-app notification, no separate provider step
          exists to confirm beyond that.
        </p>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Content</h2>
        <p className="text-xs text-foreground">
          <span className="text-muted">Message: </span>
          {campaign.message}
        </p>
        {campaign.actionLabel && campaign.actionUrl ? (
          <p className="mt-2 text-xs text-foreground">
            <span className="text-muted">Action: </span>
            {campaign.actionLabel} → {campaign.actionUrl}
          </p>
        ) : null}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-muted">Recipient details</h2>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Read</th>
                <th className="px-3 py-2 font-medium">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-foreground">{r.email}</td>
                  <td className="px-3 py-2 text-muted">{r.readAt ? formatDateTime(r.readAt) : "--"}</td>
                  <td className="px-3 py-2 text-muted">{r.clickedAt ? formatDateTime(r.clickedAt) : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
