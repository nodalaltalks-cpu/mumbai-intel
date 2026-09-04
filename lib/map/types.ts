import type { DataSource, InfraTypeValue } from "@/lib/project-meta";

/**
 * Provider-agnostic map types. Nothing outside `app/components/map/providers/*`
 * may import a mapping SDK directly — every other component, page and query
 * talks only to these shapes, so the underlying engine (currently Leaflet)
 * can be swapped later without touching consuming code.
 *
 * Phase 67 removed the Project and Developer marker kinds (ProjectMapMarker/
 * DeveloperMapMarker) along with Project.latitude/longitude — a developer's
 * pin had no position source of its own (it was the centroid of its
 * projects' coordinates), and no replacement geo field was introduced.
 * Locality and Infra markers use their own stored geo fields and are
 * unaffected.
 */

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface LocalityMapMarker {
  kind: "locality";
  id: string;
  slug: string;
  name: string;
  zoneName: string | null;
  medianPricePaise: number | null;
  avgPricePerSqftPaise: number | null;
  rentalYieldPercent: number | null;
  transactionCount: number;
  projectCount: number;
  position: MapPoint;
  /** Future-ready: polygon geometry, not populated by any query yet — see FUTURE_MAP_LAYERS. */
  boundary?: MapPoint[] | null;
  /** True for a guest — medianPricePaise/avgPricePerSqftPaise/rentalYieldPercent have already been nulled out server-side. */
  locked: boolean;
}

export interface InfraMapMarker {
  kind: "infra";
  id: string;
  name: string;
  type: InfraTypeValue;
  detail: string | null;
  dataSource: DataSource;
  position: MapPoint;
}

export type MapMarker = LocalityMapMarker | InfraMapMarker;

export interface MapFilterState {
  localityId: string;
}

export const DEFAULT_MAP_FILTERS: MapFilterState = {
  localityId: "",
};

/** Which marker kinds are currently shown — the map's own visibility toggle, independent of filters. */
export interface MapLayerVisibility {
  localities: boolean;
  /** Off by default — hundreds of infra points would otherwise swamp the map on first load. */
  infra: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  localities: true,
  infra: false,
};

/**
 * Layers the architecture is designed to support but does not render yet.
 * `Locality.centroidLat/Lng` is a placeholder for true polygon boundaries
 * once that geometry is captured — everything infra-related (metro/school/
 * hospital/mall/airport/business) is now live via `InfraMapMarker`/`infra`
 * above, driven by the automated OSM ingestion connector
 * (lib/ingestion/connectors/osmLocalityInfra.ts).
 */
export type FutureMapLayerKind = "heatmap" | "locality-boundaries";

export const FUTURE_MAP_LAYERS: readonly FutureMapLayerKind[] = ["heatmap", "locality-boundaries"];

/** Where the map should fly to — set by search selection or a filter narrowing to one result. */
export type MapFocusTarget = { point: MapPoint; zoom: number } | { bounds: [MapPoint, MapPoint] };
