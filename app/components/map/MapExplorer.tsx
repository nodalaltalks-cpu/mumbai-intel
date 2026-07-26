"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_LAYER_VISIBILITY,
  DEFAULT_MAP_FILTERS,
  type DeveloperMapMarker,
  type LocalityMapMarker,
  type MapFilterState,
  type MapFocusTarget,
  type MapLayerVisibility,
  type MapMarker,
  type ProjectMapMarker,
} from "@/lib/map/types";
import MapCanvas from "./MapCanvas";
import MapSearch from "./MapSearch";
import MapFilterPanel from "./MapFilterPanel";

function projectMatches(p: ProjectMapMarker, f: MapFilterState): boolean {
  if (f.status && p.status !== f.status) return false;
  if (f.category && p.category !== f.category) return false;
  if (f.bedrooms) {
    const n = Number(f.bedrooms);
    const matches = n >= 4 ? p.bedroomOptions.some((b) => b >= 4) : p.bedroomOptions.includes(n);
    if (!matches) return false;
  }
  if (f.builderId && p.builderId !== f.builderId) return false;
  if (f.localityId && p.localityId !== f.localityId) return false;
  if (f.priceMinRupees !== null && (p.startingPricePaise === null || p.startingPricePaise < f.priceMinRupees * 100)) return false;
  if (f.priceMaxRupees !== null && (p.startingPricePaise === null || p.startingPricePaise > f.priceMaxRupees * 100)) return false;
  return true;
}

function localityMatches(l: LocalityMapMarker, f: MapFilterState): boolean {
  return !f.localityId || l.id === f.localityId;
}

function developerMatches(d: DeveloperMapMarker, f: MapFilterState): boolean {
  return !f.builderId || d.id === f.builderId;
}

/** Owns all map interaction state — filters, layer visibility, focus and selection — and narrows the three marker datasets purely client-side (no network round-trip per interaction). */
export default function MapExplorer({
  projectMarkers,
  localityMarkers,
  developerMarkers,
}: {
  projectMarkers: ProjectMapMarker[];
  localityMarkers: LocalityMapMarker[];
  developerMarkers: DeveloperMapMarker[];
}) {
  const [filters, setFilters] = useState<MapFilterState>(DEFAULT_MAP_FILTERS);
  const [layers, setLayers] = useState<MapLayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [focus, setFocus] = useState<MapFocusTarget | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);

  const visibleProjects = useMemo(
    () => (layers.projects ? projectMarkers.filter((p) => projectMatches(p, filters)) : []),
    [projectMarkers, filters, layers.projects]
  );
  const visibleLocalities = useMemo(
    () => (layers.localities ? localityMarkers.filter((l) => localityMatches(l, filters)) : []),
    [localityMarkers, filters, layers.localities]
  );
  const visibleDevelopers = useMemo(
    () => (layers.developers ? developerMarkers.filter((d) => developerMatches(d, filters)) : []),
    [developerMarkers, filters, layers.developers]
  );
  const visibleMarkers = useMemo<MapMarker[]>(
    () => [...visibleProjects, ...visibleLocalities, ...visibleDevelopers],
    [visibleProjects, visibleLocalities, visibleDevelopers]
  );

  function handleSearchSelect(marker: MapMarker) {
    setSelectedMarker(marker);
    setFocus({ point: marker.position, zoom: marker.kind === "developer" ? 13 : 15 });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-background/95 p-3">
        <MapSearch projects={projectMarkers} localities={localityMarkers} developers={developerMarkers} onSelect={handleSearchSelect} />
      </div>

      <MapFilterPanel
        filters={filters}
        onChange={setFilters}
        layers={layers}
        onLayersChange={setLayers}
        developers={developerMarkers}
        localities={localityMarkers}
        resultCount={visibleMarkers.length}
      />

      <div className="relative min-h-0 flex-1">
        <MapCanvas markers={visibleMarkers} focus={focus} selectedId={selectedMarker?.id ?? null} onMarkerSelect={setSelectedMarker} />
      </div>
    </div>
  );
}
