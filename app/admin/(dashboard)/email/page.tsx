import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getLocalitiesForSelect } from "@/lib/admin-queries";
import { getEmailCampaigns } from "@/lib/analytics/email-queries";
import { formatDate } from "@/lib/format";
import EmailComposer from "@/app/admin/components/EmailComposer";

export const metadata: Metadata = { title: "Email — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  NEWSLETTER: "Newsletter",
  RESEARCH_UPDATE: "Research / Market Update",
  MARKET_REPORT: "Transaction / Market Report",
  PRODUCT_COMMUNICATION: "Product Communication",
  REPORT_COMMUNICATION: "Report Communication",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "border-border bg-surface-raised text-muted",
  SENDING: "border-accent/40 bg-accent/10 text-accent",
  SENT: "border-positive/40 bg-positive/10 text-positive",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

export default async function AdminEmailPage() {
  await requireAdminSession();
  const [localities, campaigns] = await Promise.all([getLocalitiesForSelect(), getEmailCampaigns(20)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Email</h1>
        <p className="text-xs text-muted">
          Lightweight in-house campaign send — no third-party newsletter/CRM tool. Every send is tracked per recipient below.
        </p>
      </div>

      <EmailComposer localities={localities} />

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Past campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="text-xs text-muted">No campaigns sent yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Recipients</th>
                  <th className="px-3 py-2 font-medium text-right">Success / Failed</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-foreground">{c.subject}</td>
                    <td className="px-3 py-2 text-muted">{TYPE_LABEL[c.type] ?? c.type}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASS[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{c.recipientCount}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">
                      {c.successCount} / {c.failureCount}
                    </td>
                    <td className="px-3 py-2 text-muted">{c.sentAt ? formatDate(c.sentAt) : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
