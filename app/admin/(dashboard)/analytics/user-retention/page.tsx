import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/guard";
import { getUserGrowthStats } from "@/lib/admin-queries";
import {
  getRetentionSnapshot,
  getRetentionCohorts,
  getFeatureRetention,
  getSearchRetentionCorrelation,
  ACTIVE_USER_DEFINITION,
} from "@/lib/analytics/retention-queries";
import { ANALYTICS_PERIOD_COOKIE, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";

export const metadata: Metadata = { title: "User Retention — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function RateCell({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted">--</span>;
  return <span className="font-mono text-foreground">{percent}%</span>;
}

export default async function UserRetentionPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireSession();
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const growth = await getUserGrowthStats();
  const [snapshot, cohorts, featureRetention, searchCorrelation] = await Promise.all([
    getRetentionSnapshot(period, growth.dau, growth.wau, growth.mau),
    getRetentionCohorts(8),
    getFeatureRetention(),
    getSearchRetentionCorrelation(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">
          User Retention <Link href="/admin/analytics" className="text-xs font-normal text-muted hover:text-accent">← Analytics</Link>
        </h1>
        <p className="text-xs text-muted">Are users coming back? Which signup cohorts retain better? Which behaviours correlate with returning?</p>
      </div>

      <div className="rounded-sm border border-border bg-surface p-3 text-[11px] text-muted">
        <span className="font-mono uppercase tracking-wide text-accent">Active user definition — </span>
        {ACTIVE_USER_DEFINITION}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <section>
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Daily Active</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.dau}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Weekly Active</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.wau}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Monthly Active</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.mau}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Total registered</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.totalUsers}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">New users ({period.label.toLowerCase()})</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.newUsersInPeriod}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Returning users ({period.label.toLowerCase()})</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{snapshot.returningUsersInPeriod}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Active ({period.label.toLowerCase()})</p>
            <p className="mt-1 font-mono text-lg font-semibold text-positive">{snapshot.activeUsersInPeriod}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">Inactive (30d+)</p>
            <p className="mt-1 font-mono text-lg font-semibold text-muted">{snapshot.inactiveUsers}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Retention by signup cohort</h2>
        <p className="mb-3 text-[11px] text-muted">
          Day-N retention is measured from each week&apos;s start, not each user&apos;s exact signup day — the whole cohort shares one set of day
          boundaries, which is what makes cohorts comparable. &quot;--&quot; means not enough time has passed yet to measure that day.
        </p>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Cohort week</th>
                <th className="px-3 py-2 font-medium text-right">Users</th>
                <th className="px-3 py-2 font-medium text-right">Day 1</th>
                <th className="px-3 py-2 font-medium text-right">Day 7</th>
                <th className="px-3 py-2 font-medium text-right">Day 14</th>
                <th className="px-3 py-2 font-medium text-right">Day 30</th>
                <th className="px-3 py-2 font-medium text-right">Day 60</th>
                <th className="px-3 py-2 font-medium text-right">Day 90</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortLabel} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2 font-mono text-foreground">{c.cohortLabel}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{c.cohortSize}</td>
                  {c.retention.map((r) => (
                    <td key={r.day} className="px-3 py-2 text-right">
                      <RateCell percent={r.percent} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Retention by behaviour</h2>
        <p className="mb-3 text-[11px] text-muted">
          Behavioural comparison, not a causal claim — users who do these things also tend to still be active a week later; that doesn&apos;t prove the
          feature caused it.
        </p>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Behaviour</th>
                <th className="px-3 py-2 font-medium text-right">Did it — 7d return rate</th>
                <th className="px-3 py-2 font-medium text-right">Didn&apos;t — 7d return rate</th>
              </tr>
            </thead>
            <tbody>
              {featureRetention.map((row) => (
                <tr key={row.feature} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">{row.feature}</td>
                  <td className="px-3 py-2 text-right">
                    <RateCell percent={row.didFeatureReturnRate} /> <span className="text-muted">({row.didFeatureCount})</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RateCell percent={row.didNotFeatureReturnRate} /> <span className="text-muted">({row.didNotFeatureCount})</span>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 text-foreground">3+ searches in first week</td>
                <td className="px-3 py-2 text-right">
                  <RateCell percent={searchCorrelation.activeSearchersReturnRate} /> <span className="text-muted">({searchCorrelation.activeSearchersCount})</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <RateCell percent={searchCorrelation.lightSearchersReturnRate} /> <span className="text-muted">({searchCorrelation.lightSearchersCount})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
