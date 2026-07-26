"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { MapFocusTarget, MapMarker } from "@/lib/map/types";
import MapSkeleton from "./MapSkeleton";

type LeafletCanvasProps = {
  markers: MapMarker[];
  focus: MapFocusTarget | null;
  selectedId: string | null;
  onMarkerSelect: (marker: MapMarker) => void;
};

/**
 * The single provider-agnostic entry point every page uses. The actual
 * engine (Leaflet today) is lazy-loaded client-only — its JS/CSS never ships
 * in the initial bundle and never runs server-side.
 *
 * Imported via a manual `useEffect` + `import()` rather than `next/dynamic`'s
 * Suspense-based lazy loading: a Suspense boundary that bails out to
 * client-only rendering has to be resolved by React's concurrent scheduler,
 * which browsers can deprioritize while a tab is backgrounded. A plain
 * promise resolved into local state has no such dependency — the swap
 * happens as soon as the module (already prefetched by the browser) resolves.
 */
export default function MapCanvas(props: LeafletCanvasProps) {
  const [Canvas, setCanvas] = useState<ComponentType<LeafletCanvasProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("./providers/leaflet/LeafletCanvas").then((mod) => {
      if (!cancelled) setCanvas(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Canvas) return <MapSkeleton />;
  return <Canvas {...props} />;
}
