import type { ProjectStatus, PropertyCategory } from "@/lib/project-meta";

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

export type MapMarker = ProjectMapMarker | LocalityMapMarker | DeveloperMapMarker;

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
}

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  projects: true,
  localities: true,
  developers: false,
};

/**
 * Layers the architecture is designed to support but does not render yet.
 * Each has a real data source already in the schema (InfraAsset covers metro/
 * school/hospital/mall/airport/park; Locality.centroidLat/Lng is a placeholder
 * for true polygon boundaries once that geometry is captured). Adding one of
 * these later means: (1) a query in lib/queries/map.ts returning the shape
 * below, (2) a render branch in the Leaflet provider — no changes anywhere
 * else, because every consumer only ever sees `MapMarker` / this union.
 */
export type FutureMapLayerKind = "heatmap" | "locality-boundaries" | "infra-metro" | "infra-school" | "infra-hospital" | "infra-business" | "transit";

export const FUTURE_MAP_LAYERS: readonly FutureMapLayerKind[] = [
  "heatmap",
  "locality-boundaries",
  "infra-metro",
  "infra-school",
  "infra-hospital",
  "infra-business",
  "transit",
];

/** Where the map should fly to — set by search selection or a filter narrowing to one result. */
export type MapFocusTarget = { point: MapPoint; zoom: number } | { bounds: [MapPoint, MapPoint] };
