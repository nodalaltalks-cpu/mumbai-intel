"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { clusterMarkers, isClusterGroup } from "@/lib/map/cluster";
import type { MapFocusTarget, MapMarker } from "@/lib/map/types";
import { INFRA_TYPE_CHART_COLOR } from "@/lib/project-meta";
import LocalityPopup from "../../popups/LocalityPopup";
import InfraPopup from "../../popups/InfraPopup";

/**
 * The only file in the app that imports `leaflet`. Everything upstream
 * (MapCanvas, MapExplorer, the page) talks purely in MapMarker/MapFocusTarget
 * — swapping the engine later means replacing this file and its icon/popup
 * wiring only.
 */

const MUMBAI_CENTER: [number, number] = [19.076, 72.8777];
const DEFAULT_ZOOM = 11;

const ICON_SIZE: Record<MapMarker["kind"], number> = { locality: 20, infra: 10 };

function markerIcon(marker: MapMarker, selected: boolean): L.DivIcon {
  const size = ICON_SIZE[marker.kind];
  const selectedClass = selected ? " mi-marker--selected" : "";
  const style = marker.kind === "infra" ? ` style="--marker-color: var(${INFRA_TYPE_CHART_COLOR[marker.type]})"` : "";
  return L.divIcon({
    className: "",
    html: `<div class="mi-marker mi-marker--${marker.kind}${selectedClass}"${style}></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function clusterIcon(count: number): L.DivIcon {
  const bucket = count < 10 ? "sm" : count < 50 ? "md" : "lg";
  const size = bucket === "sm" ? 30 : bucket === "md" ? 38 : 46;
  return L.divIcon({
    className: "",
    html: `<div class="mi-marker mi-marker--cluster mi-marker--cluster-${bucket}">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function LeafletCanvas({
  markers,
  focus,
  selectedId,
  onMarkerSelect,
}: {
  markers: MapMarker[];
  focus: MapFocusTarget | null;
  selectedId: string | null;
  onMarkerSelect: (marker: MapMarker) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    onMarkerSelectRef.current = onMarkerSelect;
  }, [onMarkerSelect]);

  // Mount the map exactly once. useLayoutEffect (not useEffect): this runs
  // synchronously during commit rather than through React's deferred passive-
  // effect scheduler, so first paint never shows an un-initialized container.
  useLayoutEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, minZoom: 9, maxZoom: 18 }).setView(MUMBAI_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: "mi-map-tiles",
    }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("popupclose", () => {
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
    });

    return () => {
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Rebuild markers/clusters whenever the visible marker set, zoom or selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;
    layerGroup.clearLayers();

    const clustered = clusterMarkers(markers, zoom);
    for (const entry of clustered) {
      if (isClusterGroup(entry)) {
        const clusterMarker = L.marker([entry.position.lat, entry.position.lng], { icon: clusterIcon(entry.count) });
        clusterMarker.on("click", () => {
          const bounds = L.latLngBounds(entry.items.map((i) => [i.position.lat, i.position.lng] as [number, number]));
          map.flyToBounds(bounds, { padding: [48, 48], duration: 0.6 });
        });
        clusterMarker.addTo(layerGroup);
        continue;
      }

      const marker = entry;
      const leafletMarker = L.marker([marker.position.lat, marker.position.lng], { icon: markerIcon(marker, marker.id === selectedId) });
      leafletMarker.on("click", () => {
        onMarkerSelectRef.current(marker);
        popupRootRef.current?.unmount();
        const container = document.createElement("div");
        const root = createRoot(container);
        popupRootRef.current = root;
        root.render(marker.kind === "locality" ? <LocalityPopup marker={marker} /> : <InfraPopup marker={marker} />);
        L.popup({ maxWidth: 288, className: "mi-map-popup", offset: [0, -ICON_SIZE[marker.kind] / 2] })
          .setLatLng([marker.position.lat, marker.position.lng])
          .setContent(container)
          .openOn(map);
      });
      leafletMarker.addTo(layerGroup);
    }
  }, [markers, zoom, selectedId]);

  // Fly to a search/filter focus target with a smooth transition.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if ("bounds" in focus) {
      map.flyToBounds(
        [
          [focus.bounds[0].lat, focus.bounds[0].lng],
          [focus.bounds[1].lat, focus.bounds[1].lng],
        ],
        { padding: [64, 64], duration: 0.8 }
      );
    } else {
      map.flyTo([focus.point.lat, focus.point.lng], focus.zoom, { duration: 0.8 });
    }
  }, [focus]);

  return <div ref={containerRef} className="h-full w-full" />;
}
