import Link from "next/link";
import type { Metadata } from "next";
import { getConversionSummary, getLockedFeatureClickCounts, getSignupTrend } from "@/lib/analytics/registration-funnel-queries";
import { getResearchActivitySummary } from "@/lib/analytics/research-queries";
import { getBrochureAnalyticsSummary } from "@/lib/analytics/brochure-queries";
import { getNewsletterSummary } from "@/lib/analytics/newsletter-queries";
import { PREMIUM_FEATURE_LABEL } from "@/lib/premium/types";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Registration Funnel — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function formatPercent(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(1)}%`;
}

export default async function RegistrationFunnelPage() {
  const [conversion, signupTrend, lockedClicks, research, brochures, newsletter] = await Promise.all([
    getConversionSummary(),
    getSignupTrend(30),
    getLockedFeatureClickCounts(),
    getResearchActivitySummary(),
    getBrochureAnalyticsSummary(),
    getNewsletterSummary(),
  ]);

  const maxLockedClicks = Math.max(...lockedClicks.map((c) => c.count), 1);

  return (
    <div className="flex flex-col gap-6">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Guest Sessions (30d)", conversion.guestSessions30d],
          ["Registered Users", conversion.registeredUsers],
          ["Registration Rate", formatPercent(conversion.registrationRate)],
          ["Locked Clicks (30d)", conversion.lockedClicks30d],
          ["Signups Today", conversion.signupsToday],
          ["Signups This Week", conversion.signupsThisWeek],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
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
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Weekly Signups — last 30 days</h2>
        <BarChart data={signupTrend.map((p) => ({ label: p.date.slice(5), count: p.count }))} emptyLabel="No signups recorded in this window yet" />
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top Locked Features</h2>
        {lockedClicks.length === 0 ? (
          <p className="text-xs text-muted">No locked-feature clicks recorded yet.</p>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Brochure Downloads</h2>
          <p className="font-mono text-2xl font-semibold text-foreground">{brochures.totalDownloads}</p>
          <p className="mt-1 text-[11px] text-muted">
            {brochures.downloadsThisWeek} this week ·{" "}
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
            +{newsletter.weeklyGrowth} this week ·{" "}
            <Link href="/admin/analytics/newsletter" className="text-accent hover:underline">
              Full report →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
