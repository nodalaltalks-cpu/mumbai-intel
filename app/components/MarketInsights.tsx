import { formatPricePerSqft } from "@/lib/format";
import { getTopLocalitiesByActivity } from "@/lib/queries";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function MarketInsights() {
  const insights = await getTopLocalitiesByActivity(3);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Real Estate Insights" subtitle="Most active localities by recorded transaction volume" viewAllHref="/insights" />

      {insights.length === 0 ? (
        <EmptyState title="No insights yet" message="Insights are computed from recorded transactions — they will appear as data is added." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {insights.map((insight, i) => (
            <div key={insight.localityId} className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Rank #{i + 1}</p>
              <h3 className="mt-1 font-mono text-sm font-semibold text-foreground">{insight.localityName}</h3>
              <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted">Transactions</p>
                  <p className="font-mono text-sm text-foreground">{insight.transactionCount}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Avg rate</p>
                  <p className="font-mono text-sm text-foreground">
                    {formatPricePerSqft(insight.avgPricePerSqftPaise)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
