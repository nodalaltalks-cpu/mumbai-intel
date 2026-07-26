import Link from "next/link";
import type { Metadata } from "next";
import { getBuilderScorecards, getDashboardStats, getLocalityDemandRanking, getTransactionVelocityTrend } from "@/lib/admin-queries";
import { formatMonth } from "@/lib/format";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Analytics — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

const DEMAND_CLASS: Record<string, string> = {
  Rising: "text-positive border-positive/40 bg-positive/10",
  Stable: "text-info border-info/40 bg-info/10",
  Cooling: "text-negative border-negative/40 bg-negative/10",
  "Insufficient data": "text-muted border-border",
};

export default async function AdminAnalyticsPage() {
  const [stats, velocity, scorecards, demandRanking] = await Promise.all([
    getDashboardStats(),
    getTransactionVelocityTrend(12),
    getBuilderScorecards(),
    getLocalityDemandRanking(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Analytics</h1>
        <p className="text-xs text-muted">Transaction velocity, builder scorecards and locality demand — computed by the analytics engine from curated data.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Projects", stats.projectCount],
          ["Published", stats.publishedCount],
          ["Drafts", stats.draftCount],
          ["Builders", stats.builderCount],
          ["Localities", stats.localityCount],
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Builder scorecards</h2>
          <p className="mb-3 text-[11px] text-muted">Portfolio composition across all tracked projects, ranked by active + delivered volume.</p>
          {scorecards.length === 0 ? (
            <p className="text-xs text-muted">No builders with projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {scorecards.map((b) => (
                <li key={b.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <Link href={`/admin/builders/${b.id}/edit`} className="text-xs font-semibold text-foreground hover:text-accent">
                      {b.name}
                    </Link>
                    <span className="text-[10px] text-muted">{b.breakdown.cityCount} cit{b.breakdown.cityCount === 1 ? "y" : "ies"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[10px] font-mono text-positive">
                      {b.breakdown.deliveredCount} delivered
                    </span>
                    <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                      {b.breakdown.underConstructionCount} under construction
                    </span>
                    <span className="rounded-sm border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-mono text-info">
                      {b.breakdown.upcomingCount} upcoming
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Locality demand ranking</h2>
          <p className="mb-3 text-[11px] text-muted">Recent (90d) vs. prior (90-180d) transaction volume, and active-project supply share.</p>
          {demandRanking.length === 0 ? (
            <p className="text-xs text-muted">Not enough transaction history to rank demand yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {demandRanking.map((l) => (
                <li key={l.id} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <Link href={`/admin/localities/${l.id}/edit`} className="text-xs text-foreground hover:text-accent">
                    {l.name}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted">{l.supplyLabel} supply</span>
                    <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${DEMAND_CLASS[l.demandLabel] ?? DEMAND_CLASS["Insufficient data"]}`}>
                      {l.demandLabel}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
