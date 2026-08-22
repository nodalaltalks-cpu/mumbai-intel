import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getMostSharedProjects,
  getReferralChannelBreakdown,
  getReferralEngagementStats,
  getReferralOverview,
  getTopReferrers,
} from "@/lib/analytics/referral-queries";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Referral Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function ReferralAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [overview, topReferrers, mostShared, channels, engagement] = await Promise.all([
    getReferralOverview(period),
    getTopReferrers(period, 10),
    getMostSharedProjects(period, 10),
    getReferralChannelBreakdown(period),
    getReferralEngagementStats(period),
  ]);

  const totalSharesChange = computeChange(overview.totalShares, overview.previousTotalShares);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Referral / Sharing Intelligence</h1>
          <p className="text-xs text-muted">Share → click → registration → engagement, from the existing ResearchEvent log — no separate tracking system.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/analytics" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            ← Analytics
          </Link>
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsStatCard
          label="Total shares"
          value={overview.totalShares + overview.projectWhatsappShares}
          previousValue={overview.previousTotalShares}
          change={totalSharesChange}
        />
        <AnalyticsStatCard label="WhatsApp shares" value={overview.whatsappShares + overview.projectWhatsappShares} />
        <AnalyticsStatCard label="Copy-link shares" value={overview.copyLinkShares} />
        <AnalyticsStatCard label="Native shares" value={overview.nativeShares} />
        <AnalyticsStatCard label="Referral clicks" value={overview.referralLinkClicks} />
        <AnalyticsStatCard label="New users from referrals" value={overview.newUsersFromReferrals} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Referral → Registration</h2>
          <p className="mb-3 text-[11px] text-muted">Of everyone who clicked a referral link in {period.label.toLowerCase()}, what share went on to register.</p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">
              {overview.registrationConversionRatePercent !== null ? `${overview.registrationConversionRatePercent}%` : "--"}
            </p>
            <p className="text-xs text-muted">
              {overview.newUsersFromReferrals} of {overview.referralLinkClicks} clicks
            </p>
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Referral → Engagement</h2>
          <p className="mb-3 text-[11px] text-muted">Of referred users who registered in {period.label.toLowerCase()}, what share went on to view a project, download a brochure, or view transactions.</p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">
              {engagement.engagementRatePercent !== null ? `${engagement.engagementRatePercent}%` : "--"}
            </p>
            <p className="text-xs text-muted">
              {engagement.referredUsersMeaningfullyEngaged} of {engagement.referredUsers} referred users
            </p>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top referrers — {period.label}</h2>
          {topReferrers.length === 0 ? (
            <p className="text-xs text-muted">No data for this period.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {topReferrers.map((r, i) => (
                <li key={r.userId} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    #{i + 1} {r.name ?? r.email}
                  </span>
                  <span className="font-mono text-accent">{r.referralCount} referrals</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Most-shared projects (WhatsApp) — {period.label}</h2>
          <BarChart data={mostShared.map((p) => ({ label: p.projectName ?? "Deleted project", count: p.shareCount }))} emptyLabel="No data for this period" />
        </section>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Referral channel breakdown — {period.label}</h2>
        <p className="mb-3 text-[11px] text-muted">Which share channel drove each attributed registration.</p>
        <BarChart data={channels.map((c) => ({ label: c.channel, count: c.count }))} emptyLabel="No data for this period" />
      </section>
    </div>
  );
}
