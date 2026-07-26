import type { MapPoint } from "./types";

/**
 * Pure, provider-agnostic marker clustering. Projects lat/lng to pixel space
 * with the standard Web Mercator formula (the same math every slippy-map
 * engine uses, including Leaflet's default CRS) so this file has zero
 * dependency on any mapping SDK and can be unit-tested or reused if the
 * provider ever changes.
 */

export interface Clusterable {
  id: string;
  position: MapPoint;
}

export interface ClusterGroup<T extends Clusterable> {
  isCluster: true;
  position: MapPoint;
  count: number;
  items: T[];
}

export type ClusterResult<T extends Clusterable> = T | ClusterGroup<T>;

function isClusterGroup<T extends Clusterable>(item: ClusterResult<T>): item is ClusterGroup<T> {
  return (item as ClusterGroup<T>).isCluster === true;
}

/** Web Mercator projection to pixel coordinates at a given zoom (256px tiles). */
function project(point: MapPoint, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const x = ((point.lng + 180) / 360) * scale;
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number): MapPoint {
  const scale = 256 * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

/**
 * Grid-based clustering: buckets markers into `gridSizePx`-square cells in
 * screen space at the given zoom, merging any cell with more than one marker
 * into a single cluster centered on the mean position of its members.
 */
export function clusterMarkers<T extends Clusterable>(items: T[], zoom: number, gridSizePx = 64): ClusterResult<T>[] {
  const cells = new Map<string, { xs: number[]; ys: number[]; items: T[] }>();

  for (const item of items) {
    const { x, y } = project(item.position, zoom);
    const key = `${Math.floor(x / gridSizePx)}:${Math.floor(y / gridSizePx)}`;
    const cell = cells.get(key) ?? { xs: [], ys: [], items: [] };
    cell.xs.push(x);
    cell.ys.push(y);
    cell.items.push(item);
    cells.set(key, cell);
  }

  const results: ClusterResult<T>[] = [];
  for (const cell of cells.values()) {
    if (cell.items.length === 1) {
      results.push(cell.items[0]);
      continue;
    }
    const meanX = cell.xs.reduce((a, b) => a + b, 0) / cell.xs.length;
    const meanY = cell.ys.reduce((a, b) => a + b, 0) / cell.ys.length;
    results.push({ isCluster: true, position: unproject(meanX, meanY, zoom), count: cell.items.length, items: cell.items });
  }
  return results;
}

export { isClusterGroup };
