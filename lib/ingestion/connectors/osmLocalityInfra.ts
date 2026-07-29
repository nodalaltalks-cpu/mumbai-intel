import "server-only";
import type { InfraType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import type { NormalizedInfraCandidate } from "../types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "NoDalalTalks/1.0 (real estate intelligence platform; contact via site)";
// Degrees around the city centroid — generous enough to cover Greater Mumbai
// from a single point, without a stored boundary polygon.
const BBOX_DEGREES = 0.22;

const TAG_SELECTORS = [
  'node["amenity"="school"]',
  'node["amenity"="hospital"]',
  'node["railway"="station"]',
  'node["station"="subway"]',
  'node["railway"="subway_entrance"]',
  'node["aeroway"="aerodrome"]',
  'node["shop"="mall"]',
];

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/** Classifies an element by its own tags — needed since one combined query can't tell us which selector matched. */
function classify(tags: Record<string, string> | undefined): InfraType | null {
  if (!tags) return null;
  if (tags.amenity === "school") return "SCHOOL";
  if (tags.amenity === "hospital") return "HOSPITAL";
  if (tags.station === "subway" || tags.railway === "subway_entrance") return "METRO_STATION";
  if (tags.railway === "station") return "RAILWAY_STATION";
  if (tags.aeroway === "aerodrome") return "AIRPORT";
  if (tags.shop === "mall") return "MALL";
  return null;
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const delaysMs = [0, 15_000, 45_000];
  let lastStatus = 0;
  for (const delay of delaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "User-Agent": USER_AGENT },
      body: query,
    });
    if (response.ok) {
      const data = (await response.json()) as OverpassResponse;
      return data.elements;
    }
    lastStatus = response.status;
    if (response.status !== 429 && response.status !== 504) break;
  }
  throw new Error(`Overpass request failed (${lastStatus})`);
}

function elementName(el: OverpassElement, type: InfraType): string {
  return el.tags?.name ?? `Unnamed ${type.toLowerCase().replace(/_/g, " ")}`;
}

/**
 * Fetches schools/hospitals/metro/rail/airport/malls for Mumbai from
 * OpenStreetMap's public Overpass API — a single unioned bounding-box query
 * (not one request per tag) to stay well inside Overpass's fair-use policy,
 * with backoff retries if the shared public instance is momentarily busy.
 */
export async function fetchOsmLocalityInfra(): Promise<NormalizedInfraCandidate[]> {
  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG } });
  if (!city || city.centroidLat === null || city.centroidLng === null) {
    throw new Error(`City "${PRIMARY_CITY_SLUG}" has no centroid set — cannot compute a bounding box`);
  }

  const south = city.centroidLat - BBOX_DEGREES;
  const north = city.centroidLat + BBOX_DEGREES;
  const west = city.centroidLng - BBOX_DEGREES;
  const east = city.centroidLng + BBOX_DEGREES;
  const bbox = `${south},${west},${north},${east}`;

  const query = `[out:json][timeout:60];(${TAG_SELECTORS.map((s) => `${s}(${bbox});`).join("")});out center tags;`;
  const elements = await fetchOverpass(query);

  const candidates: NormalizedInfraCandidate[] = [];
  for (const el of elements) {
    if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
    const type = classify(el.tags);
    if (!type) continue;
    candidates.push({
      type,
      name: elementName(el, type),
      latitude: el.lat,
      longitude: el.lon,
      sourceRef: `osm:node/${el.id}`,
      detail: el.tags?.operator ?? el.tags?.network ?? undefined,
    });
  }
  return candidates;
}

export const OSM_LOCALITY_INFRA_SOURCE_KEY = "osm-locality-infra";
