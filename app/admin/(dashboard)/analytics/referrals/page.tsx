import Link from "next/link";
import type { Metadata } from "next";
import {
  getMostSharedProjects,
  getReferralChannelBreakdown,
  getReferralEngagementStats,
  getReferralOverview,
  getTopReferrers,
} from "@/lib/analytics/referral-queries";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Referral Analytics — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const RANGE_OPTIONS = [
  { key: "7", label: "7d", days: 7 },
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "90d", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

export default async function ReferralAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const selected = RANGE_OPTIONS.find((r) => r.key === range) ?? RANGE_OPTIONS[3];
  const since = selected.days !== null ? new Date(Date.now() - selected.days * 24 * 60 * 60 * 1000) : undefined;

  const [overview, topReferrers, mostShared, channels, engagement] = await Promise.all([
    getReferralOverview(since),
    getTopReferrers(10),
    getMostSharedProjects(10),
    getReferralChannelBreakdown(),
    getReferralEngagementStats(),
  ]);

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
          {RANGE_OPTIONS.map((r) => (
            <Link
              key={r.key}
              href={`/admin/analytics/referrals?range=${r.key}`}
              className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
                selected.key === r.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total shares", overview.totalShares + overview.projectWhatsappShares],
          ["WhatsApp shares", overview.whatsappShares + overview.projectWhatsappShares],
          ["Copy-link shares", overview.copyLinkShares],
          ["Native shares", overview.nativeShares],
          ["Referral clicks", overview.referralLinkClicks],
          ["New users from referrals", overview.newUsersFromReferrals],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Referral → Registration</h2>
          <p className="mb-3 text-[11px] text-muted">Of everyone who clicked a referral link, what share went on to register.</p>
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
          <p className="mb-3 text-[11px] text-muted">Of referred users who registered, what share went on to view a project, download a brochure, or view transactions.</p>
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
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top referrers</h2>
          {topReferrers.length === 0 ? (
            <p className="text-xs text-muted">No referred registrations yet.</p>
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
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Most-shared projects (WhatsApp)</h2>
          <BarChart
            data={mostShared.map((p) => ({ label: p.projectName ?? "Deleted project", count: p.shareCount }))}
            emptyLabel="No project WhatsApp shares yet"
          />
        </section>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Referral channel breakdown</h2>
        <p className="mb-3 text-[11px] text-muted">Which share channel drove each attributed registration.</p>
        <BarChart data={channels.map((c) => ({ label: c.channel, count: c.count }))} emptyLabel="No attributed registrations yet" />
      </section>
    </div>
  );
}
