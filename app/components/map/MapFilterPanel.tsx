"use client";

import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS, PROJECT_STATUSES, PROPERTY_CATEGORIES, STATUS_LABEL } from "@/lib/project-meta";
import type { DeveloperMapMarker, LocalityMapMarker, MapFilterState, MapLayerVisibility } from "@/lib/map/types";
import { chipClass, selectClass, selectStyle } from "@/app/components/ui/formStyles";
import { trackFilterApplied } from "@/lib/analytics/ga";

const LAYER_CHIPS: { key: keyof MapLayerVisibility; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "localities", label: "Localities" },
  { key: "developers", label: "Developers" },
  { key: "infra", label: "Infrastructure" },
];

export default function MapFilterPanel({
  filters,
  onChange,
  layers,
  onLayersChange,
  developers,
  localities,
  resultCount,
}: {
  filters: MapFilterState;
  onChange: (next: MapFilterState) => void;
  layers: MapLayerVisibility;
  onLayersChange: (next: MapLayerVisibility) => void;
  developers: DeveloperMapMarker[];
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
        <select value={filters.status} onChange={(e) => set("status", e.target.value as MapFilterState["status"])} className={selectClass} style={selectStyle}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={filters.category} onChange={(e) => set("category", e.target.value as MapFilterState["category"])} className={selectClass} style={selectStyle}>
          <option value="">All property types</option>
          {PROPERTY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={filters.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">Any configuration</option>
          {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select value={filters.builderId} onChange={(e) => set("builderId", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All developers</option>
          {developers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={filters.localityId} onChange={(e) => set("localityId", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All localities</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={filters.priceMinRupees ?? ""}
          onChange={(e) => set("priceMinRupees", e.target.value ? Number(e.target.value) : null)}
          placeholder="Min ₹"
          className="w-20 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none"
        />
        <input
          type="number"
          min={0}
          value={filters.priceMaxRupees ?? ""}
          onChange={(e) => set("priceMaxRupees", e.target.value ? Number(e.target.value) : null)}
          placeholder="Max ₹"
          className="w-20 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none"
        />
        {filters.status || filters.category || filters.bedrooms || filters.builderId || filters.localityId || filters.priceMinRupees || filters.priceMaxRupees ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, status: "", category: "", bedrooms: "", builderId: "", localityId: "", priceMinRupees: null, priceMaxRupees: null })}
            className="text-[11px] text-muted underline-offset-2 hover:text-negative hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
