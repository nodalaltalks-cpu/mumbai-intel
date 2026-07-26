import { formatPriceBand, formatPricePerSqft } from "@/lib/format";
import { CATEGORY_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/project-meta";
import type { ProjectMapMarker } from "@/lib/map/types";

/** Rendered inside a Leaflet popup via a detached React root — plain <a> tags only, no next/link (no router context there). */
export default function ProjectPopup({ marker }: { marker: ProjectMapMarker }) {
  return (
    <div className="flex w-64 flex-col gap-2 p-1 font-sans">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold text-foreground">{marker.name}</h3>
        <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${STATUS_CLASS[marker.status]}`}>
          {STATUS_LABEL[marker.status]}
        </span>
      </div>
      <p className="text-xs text-muted">
        {marker.builderName ? `${marker.builderName} · ` : ""}
        {marker.localityName}
      </p>
      <p className="text-[11px] text-muted">{CATEGORY_LABEL[marker.category]}{marker.configurationSummary ? ` · ${marker.configurationSummary}` : ""}</p>

      <div className="flex items-end justify-between border-t border-border pt-2">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-muted">Starting price</p>
          <p className="font-mono text-sm text-accent">{formatPriceBand(marker.startingPricePaise, null)}</p>
        </div>
        {marker.pricePerSqftPaise ? (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wide text-muted">Price/sqft</p>
            <p className="font-mono text-xs text-foreground">{formatPricePerSqft(marker.pricePerSqftPaise)}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
        <a href={`/projects/${marker.slug}`} className="rounded-sm bg-accent px-2 py-1.5 text-center font-mono uppercase tracking-wide text-white hover:bg-accent-dim">
          Open Project
        </a>
        <a href={`/reports/projects/${marker.slug}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
          Report
        </a>
        <a href={`/localities/${marker.localitySlug}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
          Locality
        </a>
        {marker.builderSlug ? (
          <a href={`/builders/${marker.builderSlug}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
            Developer
          </a>
        ) : (
          <a href={`/transactions?project=${marker.id}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
            Transactions
          </a>
        )}
      </div>
    </div>
  );
}
