"use client";

import type { LocalityMapMarker, MapFilterState, MapLayerVisibility } from "@/lib/map/types";
import { chipClass, selectClass, selectStyle } from "@/app/components/ui/formStyles";
import { trackFilterApplied } from "@/lib/analytics/ga";

const LAYER_CHIPS: { key: keyof MapLayerVisibility; label: string }[] = [
  { key: "localities", label: "Localities" },
  { key: "infra", label: "Infrastructure" },
];

export default function MapFilterPanel({
  filters,
  onChange,
  layers,
  onLayersChange,
  localities,
  resultCount,
}: {
  filters: MapFilterState;
  onChange: (next: MapFilterState) => void;
  layers: MapLayerVisibility;
  onLayersChange: (next: MapLayerVisibility) => void;
  localities: LocalityMapMarker[];
  resultCount: number;
}) {
  function set<K extends keyof MapFilterState>(key: K, value: MapFilterState[K]) {
    onChange({ ...filters, [key]: value });
    if (value) trackFilterApplied("map", { [key]: value });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-background/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        {LAYER_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onLayersChange({ ...layers, [chip.key]: !layers[chip.key] })}
            aria-pressed={layers[chip.key]}
            className={chipClass(layers[chip.key])}
          >
            {chip.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">{resultCount} on map</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filters.localityId} onChange={(e) => set("localityId", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All localities</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {filters.localityId ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, localityId: "" })}
            className="text-[11px] text-muted underline-offset-2 hover:text-negative hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
