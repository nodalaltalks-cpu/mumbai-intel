import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getConversionSummary,
  getGuestVsLoggedInSplit,
  getLockedFeatureClickCounts,
  getSignupTrend,
  getTopProjectsBeforeSignup,
} from "@/lib/analytics/registration-funnel-queries";
import { getResearchActivitySummary } from "@/lib/analytics/research-queries";
import { getBrochureAnalyticsSummary } from "@/lib/analytics/brochure-queries";
import { getNewsletterSummary } from "@/lib/analytics/newsletter-queries";
import { PREMIUM_FEATURE_LABEL } from "@/lib/premium/types";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import BarChart from "@/app/admin/components/charts/BarChart";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Registration Funnel — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function formatPercent(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(1)}%`;
}

export default async function RegistrationFunnelPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [conversion, signupTrend, lockedClicks, research, brochures, newsletter, guestVsLoggedIn, topBeforeSignup] = await Promise.all([
    getConversionSummary(period),
    getSignupTrend(period),
    getLockedFeatureClickCounts(period),
    getResearchActivitySummary(period),
    getBrochureAnalyticsSummary(period),
    getNewsletterSummary(period),
    getGuestVsLoggedInSplit(period),
    getTopProjectsBeforeSignup(period, 10),
  ]);

  const maxLockedClicks = Math.max(...lockedClicks.map((c) => c.count), 1);
  const totalGuestVsLoggedIn = guestVsLoggedIn.guestEvents + guestVsLoggedIn.loggedInEvents;
  const guestSharePercent = totalGuestVsLoggedIn > 0 ? (guestVsLoggedIn.guestEvents / totalGuestVsLoggedIn) * 100 : null;
  const guestSessionsChange = computeChange(conversion.guestSessions, conversion.previousGuestSessions);
  const newUsersChange = computeChange(conversion.newUsersInPeriod, conversion.previousNewUsersInPeriod);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Registration Funnel</h1>
          <p className="text-xs text-muted">
            Guest browsing vs. free-account conversion — every number here is derived from ResearchEvent rows, same identity model as{" "}
            <Link href="/admin/analytics/research" className="text-accent hover:underline">
              Research Intent
            </Link>
            .
          </p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsStatCard label="Guest Sessions" value={conversion.guestSessions} previousValue={conversion.previousGuestSessions} change={guestSessionsChange} />
        <AnalyticsStatCard label="New Signups" value={conversion.newUsersInPeriod} previousValue={conversion.previousNewUsersInPeriod} change={newUsersChange} />
        <AnalyticsStatCard label="Registered Users (all time)" value={conversion.registeredUsers} />
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Registration Rate</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatPercent(conversion.registrationRate)}</p>
        </div>
        <AnalyticsStatCard label="Locked Clicks" value={conversion.lockedClicks} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Google Sign In</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatPercent(conversion.googleSignupPercent)}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Email Sign In</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatPercent(conversion.emailSignupPercent)}</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Guest vs. Logged-in — {period.label}</h2>
        {totalGuestVsLoggedIn === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
        ) : (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-background">
              <div className="h-full bg-accent" style={{ width: `${guestSharePercent}%` }} />
              <div className="h-full bg-positive" style={{ width: `${100 - (guestSharePercent ?? 0)}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>Guest: {guestVsLoggedIn.guestEvents} ({formatPercent(guestSharePercent)})</span>
              <span>Logged-in: {guestVsLoggedIn.loggedInEvents} ({formatPercent(100 - (guestSharePercent ?? 0))})</span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Signups — {period.label}</h2>
        <BarChart data={signupTrend.map((p) => ({ label: p.label, count: p.count }))} emptyLabel="No data for this period" />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top Locked Features — {period.label}</h2>
        {lockedClicks.length === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lockedClicks.map((c) => (
              <li key={c.feature} className="flex items-center gap-2">
                <span className="w-48 shrink-0 truncate text-xs text-foreground">{c.feature === "unknown" ? "Unknown" : PREMIUM_FEATURE_LABEL[c.feature]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(c.count / maxLockedClicks) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Most Clicked Projects Before Signup — {period.label}</h2>
        {topBeforeSignup.length === 0 ? (
          <p className="text-xs text-muted">No data for this period.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topBeforeSignup.map((item, i) => (
              <li key={item.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-muted">{i + 1}</span>
                  <Link href={item.href} className="truncate text-xs text-foreground hover:text-accent">
                    {item.name}
                  </Link>
                </span>
                <span className="shrink-0 font-mono text-xs text-accent">{item.viewCount}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Brochure Downloads</h2>
          <p className="font-mono text-2xl font-semibold text-foreground">{brochures.downloadsInPeriod}</p>
          <p className="mt-1 text-[11px] text-muted">
            {period.label} ·{" "}
            <Link href="/admin/analytics/brochures" className="text-accent hover:underline">
              Full report →
            </Link>
          </p>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Compare &amp; Wishlist Usage</h2>
          <p className="font-mono text-2xl font-semibold text-foreground">
            {research.compareUsed} <span className="text-sm font-normal text-muted">compare</span>
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {research.wishlistAdded} <span className="text-sm font-normal text-muted">wishlist adds</span>
          </p>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Newsletter Subscribers</h2>
          <p className="font-mono text-2xl font-semibold text-foreground">{newsletter.totalSubscribers}</p>
          <p className="mt-1 text-[11px] text-muted">
            +{newsletter.newSubscribersInPeriod} in {period.label.toLowerCase()} ·{" "}
            <Link href="/admin/analytics/newsletter" className="text-accent hover:underline">
              Full report →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
