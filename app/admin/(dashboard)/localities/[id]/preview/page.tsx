import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getLocalityBuilderDistribution,
  getLocalityForEdit,
  getLocalityMarketStats,
  getLocalityNearbyInfra,
} from "@/lib/admin-queries";
import { formatPaise, formatPricePerSqft, formatSignedPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Preview — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function LocalityPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locality = await getLocalityForEdit(id);
  if (!locality) notFound();

  const [stats, builderDistribution, nearbyInfra] = await Promise.all([
    getLocalityMarketStats(id),
    getLocalityBuilderDistribution(id),
    getLocalityNearbyInfra(id),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Admin preview — not the live public page</p>
          <h1 className="font-mono text-lg font-semibold text-foreground">{locality.name}</h1>
        </div>
        <Link
          href={`/admin/localities/${locality.id}/edit`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Back to edit
        </Link>
      </div>

      {!locality.isPublished ? (
        <div className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
          This locality is a draft — it is not visible on the public site yet.
        </div>
      ) : null}

      <div className="relative h-48 w-full overflow-hidden rounded-sm border border-border bg-surface">
        {locality.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={locality.coverImageUrl} alt={locality.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No cover image uploaded</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
        <Fact label="Avg price/sqft" value={formatPricePerSqft(locality.avgPricePerSqftPaise)} />
        <Fact label="Rental yield" value={locality.rentalYieldPercent !== null ? `${locality.rentalYieldPercent}%` : "--"} />
        <Fact label="YoY growth" value={formatSignedPercent(locality.growthPercentYoy)} />
        <Fact label="Transactions" value={stats.totalTransactions} />
        <Fact label="Sales volume" value={formatPaise(stats.totalSalesVolumePaise)} />
        <Fact label="Avg ticket size" value={formatPaise(stats.avgTicketSizePaise)} />
        <Fact label="Median price" value={formatPaise(stats.medianPricePaise)} />
        <Fact label="Projects" value={locality._count?.projects ?? "--"} />
      </div>

      {locality.description ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description</h2>
          <div className="prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: locality.description }} />
        </div>
      ) : null}

      {locality.advantages.length > 0 || locality.disadvantages.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {locality.advantages.length > 0 ? (
            <div className="rounded-sm border border-positive/30 bg-positive/5 p-4">
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-positive">Advantages</h2>
              <ul className="flex flex-col gap-1">
                {locality.advantages.map((a, i) => (
                  <li key={i} className="text-xs text-foreground">
                    + {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {locality.disadvantages.length > 0 ? (
            <div className="rounded-sm border border-negative/30 bg-negative/5 p-4">
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-negative">Disadvantages</h2>
              <ul className="flex flex-col gap-1">
                {locality.disadvantages.map((d, i) => (
                  <li key={i} className="text-xs text-foreground">
                    − {d}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
        <Fact label="Investment score" value={locality.investmentScore ?? "--"} />
        <Fact label="End-user score" value={locality.endUserScore ?? "--"} />
        <Fact label="Luxury score" value={locality.luxuryScore ?? "--"} />
        <Fact label="Family score" value={locality.familyScore ?? "--"} />
      </div>

      {locality.amenities.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {locality.amenities.map((la) => (
              <span key={la.id} className="rounded-sm border border-border px-2 py-1 text-xs text-foreground">
                {la.amenity.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {builderDistribution.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Builder distribution</h2>
          <ul className="flex flex-col gap-1">
            {builderDistribution.map((b, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{b.label}</span>
                <span className="font-mono text-muted">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nearbyInfra.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Nearby infrastructure</h2>
          <ul className="flex flex-col gap-1">
            {nearbyInfra.slice(0, 8).map((item) => (
              <li key={item.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{item.name}</span>
                <span className="font-mono text-muted">{(item.distanceMeters / 1000).toFixed(1)} km</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {locality.images.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Gallery</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {locality.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={img.url} alt={img.alt ?? ""} className="h-24 w-full rounded-sm object-cover" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}
