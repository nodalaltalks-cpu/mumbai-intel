import Link from "next/link";
import type { Metadata } from "next";
import { getBuilderTrustLeaderboard, getDashboardCharts, getLocalityMarketSnapshot } from "@/lib/admin-queries";
import { formatDate, formatSignedPercent } from "@/lib/format";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "Market Intelligence — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function MarketIntelligencePage() {
  const [charts, leaderboard, localities] = await Promise.all([
    getDashboardCharts(),
    getBuilderTrustLeaderboard(),
    getLocalityMarketSnapshot(),
  ]);

  const topGrowth = [...localities]
    .filter((l) => l.growthPercentYoy !== null)
    .sort((a, b) => Number(b.growthPercentYoy) - Number(a.growthPercentYoy))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Market Intelligence</h1>
        <p className="text-xs text-muted">Cross-cutting view over builders, localities and inventory — all curated, source-tagged data.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Builder trust leaderboard</h2>
          {leaderboard.length === 0 ? (
            <p className="text-xs text-muted">No builder trust scores recorded yet — add a snapshot from a builder&apos;s edit page.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {leaderboard.map((b, i) => (
                <li key={b.id} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <Link href={`/admin/builders/${b.id}/edit`} className="text-xs text-foreground hover:text-accent">
                    <span className="mr-2 font-mono text-muted">#{i + 1}</span>
                    {b.name}
                  </Link>
                  <span className="font-mono text-xs text-accent">{b.score.toFixed(1)}/10</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top localities by YoY growth</h2>
          {topGrowth.length === 0 ? (
            <p className="text-xs text-muted">No locality growth data curated yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topGrowth.map((l) => (
                <li key={l.id} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <Link href={`/admin/localities/${l.id}/edit`} className="text-xs text-foreground hover:text-accent">
                    {l.name}
                  </Link>
                  <span className="font-mono text-xs text-positive">{formatSignedPercent(Number(l.growthPercentYoy))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Inventory by locality</h2>
          <BarChart data={charts.byLocality} />
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Inventory by builder</h2>
          <BarChart data={charts.byBuilder} />
        </section>
      </div>

      {leaderboard.length > 0 ? (
        <p className="text-[10px] text-muted">Trust scores last updated {formatDate(leaderboard[0]?.asOf)}.</p>
      ) : null}
    </div>
  );
}
