import Link from "next/link";
import type { Metadata } from "next";
import { getDashboardStats, getTransactionVelocityTrend } from "@/lib/admin-queries";
import { formatMonth } from "@/lib/format";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const [stats, velocity] = await Promise.all([getDashboardStats(), getTransactionVelocityTrend(12)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Analytics</h1>
          <p className="text-xs text-muted">Projects, transactions and transaction velocity — computed by the analytics engine from curated data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/analytics/brochures" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Brochure Analytics →
          </Link>
          <Link href="/admin/analytics/profile-completion" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Profile Completion →
          </Link>
          <Link href="/admin/analytics/newsletter" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Newsletter →
          </Link>
          <Link href="/admin/analytics/research" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Research Intent →
          </Link>
          <Link href="/admin/analytics/registration-funnel" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Registration Funnel →
          </Link>
          <Link href="/admin/analytics/data-quality" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Data Quality →
          </Link>
          <Link href="/admin/analytics/referrals" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            Referrals →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Projects", stats.projectCount],
          ["Published", stats.publishedCount],
          ["Drafts", stats.draftCount],
          ["Transactions", stats.transactionCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Transaction velocity — monthly registrations</h2>
        <BarChart
          data={velocity.map((p) => ({ label: formatMonth(p.month), count: p.count }))}
          emptyLabel="No transactions recorded in this window yet"
        />
      </section>
    </div>
  );
}
