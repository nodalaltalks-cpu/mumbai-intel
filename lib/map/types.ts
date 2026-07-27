import type { DataSource, InfraTypeValue, ProjectStatus, PropertyCategory } from "@/lib/project-meta";

/**
 * Provider-agnostic map types. Nothing outside `app/components/map/providers/*`
 * may import a mapping SDK directly — every other component, page and query
 * talks only to these shapes, so the underlying engine (currently Leaflet)
 * can be swapped later without touching consuming code.
 */

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface ProjectMapMarker {
  kind: "project";
  id: string;
  slug: string;
  name: string;
  builderName: string | null;
  builderSlug: string | null;
  localityName: string;
  localitySlug: string;
  localityId: string;
  builderId: string | null;
  status: ProjectStatus;
  category: PropertyCategory;
  bedroomOptions: number[];
  startingPricePaise: number | null;
  pricePerSqftPaise: number | null;
  configurationSummary: string | null;
  imageUrl: string | null;
  position: MapPoint;
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
}

export interface DeveloperMapMarker {
  kind: "developer";
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  projectCount: number;
  overallScore: number | null;
  /** Derived — centroid of this developer's geolocated published projects (Builder has no stored geo field). */
  position: MapPoint;
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

export type MapMarker = ProjectMapMarker | LocalityMapMarker | DeveloperMapMarker | InfraMapMarker;

export interface MapFilterState {
  status: ProjectStatus | "";
  category: PropertyCategory | "";
  priceMinRupees: number | null;
  priceMaxRupees: number | null;
  builderId: string;
  localityId: string;
  bedrooms: string;
}

export const DEFAULT_MAP_FILTERS: MapFilterState = {
  status: "",
  category: "",
  priceMinRupees: null,
  priceMaxRupees: null,
  builderId: "",
  localityId: "",
  bedrooms: "",
};

/** Which marker kinds are currently shown — the map's own visibility toggle, independent of filters. */
export interface MapLayerVisibility {
  projects: boolean;
  localities: boolean;
  developers: boolean;
  /** Off by default — hundreds of infra points would otherwise swamp the map on first load. */
  infra: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  projects: true,
  localities: true,
  developers: false,
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
