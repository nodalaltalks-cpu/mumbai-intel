import { formatCompactCount, formatPricePerSqft } from "@/lib/format";
import { getMarketSnapshot, type MarketSnapshotFilters } from "@/lib/queries";

function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
      {sublabel ? <p className="mt-1 text-[11px] text-muted">{sublabel}</p> : null}
    </div>
  );
}

/**
 * Homepage teaser call site: `<MarketSnapshot />` with no props, always
 * Mumbai. The /market-data page passes `filters`/`geographyLabel` from its
 * own City/State selects — same component, same query, no second data path.
 * "Transactions recorded" was removed from here on purpose: transaction
 * counts belong to the Transaction Intelligence domain (lib/queries/transactions.ts),
 * not this panel — see getMarketSnapshot's doc comment.
 */
export default async function MarketSnapshot({
  filters,
  geographyLabel = "Mumbai",
}: {
  filters?: MarketSnapshotFilters;
  geographyLabel?: string;
}) {
  const snapshot = await getMarketSnapshot(filters);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-muted">
          Market Snapshot · {geographyLabel}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Live from database
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Live projects" value={formatCompactCount(snapshot.liveProjectsCount)} />
        <StatTile label="Localities covered" value={formatCompactCount(snapshot.localitiesCount)} />
        <StatTile label="Avg price / sqft" value={formatPricePerSqft(snapshot.avgPricePerSqftPaise)} />
        <StatTile label="Builders tracked" value={formatCompactCount(snapshot.buildersCount)} />
      </div>
    </section>
  );
}
