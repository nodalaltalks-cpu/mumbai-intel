import { formatPaise, formatPricePerSqft } from "@/lib/format";
import type { LocalityMapMarker } from "@/lib/map/types";

export default function LocalityPopup({ marker }: { marker: LocalityMapMarker }) {
  return (
    <div className="flex w-64 flex-col gap-2 p-1 font-sans">
      <div>
        <h3 className="font-mono text-sm font-semibold text-foreground">{marker.name}</h3>
        {marker.zoneName ? <p className="text-xs text-muted">{marker.zoneName}</p> : null}
      </div>
      <p className="text-[11px] text-muted">
        {marker.projectCount} project{marker.projectCount === 1 ? "" : "s"} · {marker.transactionCount} transaction{marker.transactionCount === 1 ? "" : "s"}
      </p>

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-[10px]">
        <div>
          <p className="uppercase tracking-wide text-muted">Median price</p>
          <p className="font-mono text-xs text-accent">{formatPaise(marker.medianPricePaise)}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide text-muted">Price/sqft</p>
          <p className="font-mono text-xs text-foreground">{formatPricePerSqft(marker.avgPricePerSqftPaise)}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-muted">Rental yield</p>
          <p className="font-mono text-xs text-foreground">{marker.rentalYieldPercent !== null ? `${marker.rentalYieldPercent}%` : "--"}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide text-muted">Transactions</p>
          <p className="font-mono text-xs text-foreground">{marker.transactionCount}</p>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
        <a href={`/localities/${marker.slug}`} className="rounded-sm bg-accent px-2 py-1.5 text-center font-mono uppercase tracking-wide text-white hover:bg-accent-dim">
          Open Locality
        </a>
        <a href={`/reports/areas/${marker.slug}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
          Report
        </a>
        <a href={`/transactions?locality=${marker.id}`} className="col-span-2 rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
          Transactions
        </a>
      </div>
    </div>
  );
}
