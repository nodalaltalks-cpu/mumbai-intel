import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getVisitorOverview, getVisitorSourceBreakdown } from "@/lib/analytics/visitor-queries";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Visitors — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  direct: "Direct",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  referral: "Referral link",
  other_website: "Other website",
  unknown: "Unknown",
};

export default async function VisitorsAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const session = await requireSession();
  if (!(await hasPermission(session, "users.view"))) redirect("/admin");
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [overview, sourceBreakdown] = await Promise.all([getVisitorOverview(period), getVisitorSourceBreakdown(period)]);
  const anonymousChange = computeChange(overview.anonymousVisitors, overview.previousAnonymousVisitors);

  const anonToRegisteredPercent =
    overview.anonymousVisitors > 0 ? Math.round((overview.anonymousToRegistered / overview.anonymousVisitors) * 100) : null;
  const anonToResearcherPercent =
    overview.anonymousVisitors > 0 ? Math.round((overview.anonymousToActiveResearcher / overview.anonymousVisitors) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Visitors</h1>
          <p className="text-xs text-muted">
            Anonymous visitor measurement from the existing consented first-party cookie (mi_anon_id) and research event
            log — no raw cookie values, no individual tracking shown here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/analytics" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            ← Analytics
          </Link>
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AnalyticsStatCard
          label="Anonymous visitors"
          value={overview.anonymousVisitors}
          previousValue={overview.previousAnonymousVisitors}
          change={anonymousChange}
        />
        <AnalyticsStatCard label="New visitors" value={overview.newVisitors} />
        <AnalyticsStatCard label="Returning visitors" value={overview.returningVisitors} />
        <AnalyticsStatCard label="Anonymous → registered" value={overview.anonymousToRegistered} />
        <AnalyticsStatCard label="Anonymous → active researcher" value={overview.anonymousToActiveResearcher} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Anonymous → Registered</h2>
          <p className="mb-3 text-[11px] text-muted">Of anonymous visitors in {period.label.toLowerCase()}, what share went on to create an account.</p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">{anonToRegisteredPercent !== null ? `${anonToRegisteredPercent}%` : "--"}</p>
            <p className="text-xs text-muted">
              {overview.anonymousToRegistered} of {overview.anonymousVisitors} anonymous visitors
            </p>
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Anonymous → Active Researcher</h2>
          <p className="mb-3 text-[11px] text-muted">
            Of anonymous visitors in {period.label.toLowerCase()}, what share searched, viewed a project, or otherwise
            showed real research intent (not just a page arrival).
          </p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">{anonToResearcherPercent !== null ? `${anonToResearcherPercent}%` : "--"}</p>
            <p className="text-xs text-muted">
              {overview.anonymousToActiveResearcher} of {overview.anonymousVisitors} anonymous visitors
            </p>
          </div>
        </section>
      </div>

      {sourceBreakdown.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Where visitors come from — {period.label}</h2>
          <p className="mb-3 text-[11px] text-muted">
            First-touch source, captured once per anonymous session the moment analytics cookies are accepted — only covers sessions since this was
            added, not full historical traffic.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                  <th className="py-1.5 font-medium text-right">Active researchers</th>
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown
                  .slice()
                  .sort((a, b) => b.sessions - a.sessions)
                  .map((row) => (
                    <tr key={row.source} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 text-foreground">{SOURCE_LABEL[row.source] ?? row.source}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                      <td className="py-1.5 text-right font-mono text-muted">{row.activeResearchers}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-[11px] text-muted">
        These numbers only include visitors who accepted analytics cookies on the consent banner — a decline means no
        anonymous visitor id is created for that visit, so it can&apos;t appear here.
      </p>
    </div>
  );
}
