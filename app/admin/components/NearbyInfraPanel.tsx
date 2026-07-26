const TYPE_LABEL: Record<string, string> = {
  METRO_STATION: "Metro",
  RAILWAY_STATION: "Railway",
  SCHOOL: "School",
  HOSPITAL: "Hospital",
  MALL: "Mall",
  AIRPORT: "Airport",
  ROAD: "Road",
  BUSINESS_DISTRICT: "Business district",
};

export interface NearbyInfraItem {
  id: string;
  name: string;
  type: string;
  distanceMeters: number;
}

export default function NearbyInfraPanel({ items }: { items: NearbyInfraItem[] }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Nearby infrastructure</h3>
      <p className="mt-1 text-xs text-muted">
        Computed automatically from the city&apos;s infrastructure assets and this locality&apos;s coordinates — not manually
        entered, so it never drifts out of sync.
      </p>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          No infrastructure found within range. Set the locality&apos;s centroid coordinates, and make sure infrastructure
          assets are recorded for this city.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between border-t border-border pt-1.5 text-xs first:border-t-0 first:pt-0">
              <span className="text-foreground">
                {item.name} <span className="text-muted">· {TYPE_LABEL[item.type] ?? item.type}</span>
              </span>
              <span className="font-mono text-muted">{(item.distanceMeters / 1000).toFixed(1)} km</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
