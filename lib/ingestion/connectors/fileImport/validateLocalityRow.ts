export interface ValidatedLocalityRow {
  name: string;
  pincode?: string;
  description?: string;
  centroidLat?: number;
  centroidLng?: number;
  avgPriceRupeesPerSqft?: number;
  rentalYieldPercent?: number;
  connectivityNotes?: string;
}

export type LocalityValidationResult = { ok: true; data: ValidatedLocalityRow } | { ok: false; error: string };

const INDIA_LAT_RANGE = [6, 38] as const;
const INDIA_LNG_RANGE = [68, 98] as const;

function parsePositiveNumber(raw: string | undefined, label: string): { ok: true; value?: number } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: undefined };
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return { ok: false, error: `"${label}" must be a positive number, got "${raw}"` };
  return { ok: true, value: n };
}

/** Required-field and sanity checks only — mirrors validateProjectRow.ts's discipline. */
export function validateLocalityRow(mapped: Record<string, string>): LocalityValidationResult {
  const name = mapped.name?.trim();
  if (!name) return { ok: false, error: "Missing locality name" };

  let centroidLat: number | undefined;
  let centroidLng: number | undefined;
  if (mapped.centroidLat || mapped.centroidLng) {
    const lat = Number(mapped.centroidLat);
    const lng = Number(mapped.centroidLng);
    if (!mapped.centroidLat || !mapped.centroidLng || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { ok: false, error: "Latitude and longitude must both be provided as numbers, or both omitted" };
    }
    if (lat < INDIA_LAT_RANGE[0] || lat > INDIA_LAT_RANGE[1] || lng < INDIA_LNG_RANGE[0] || lng > INDIA_LNG_RANGE[1]) {
      return { ok: false, error: `Latitude/longitude (${lat}, ${lng}) falls outside India's bounds` };
    }
    centroidLat = lat;
    centroidLng = lng;
  }

  const avgPrice = parsePositiveNumber(mapped.avgPriceRupeesPerSqft, "Avg price per sqft");
  if (!avgPrice.ok) return avgPrice;

  let rentalYieldPercent: number | undefined;
  if (mapped.rentalYieldPercent) {
    const pct = Number(mapped.rentalYieldPercent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return { ok: false, error: `"Rental yield" must be 0-100, got "${mapped.rentalYieldPercent}"` };
    }
    rentalYieldPercent = pct;
  }

  return {
    ok: true,
    data: {
      name,
      pincode: mapped.pincode || undefined,
      description: mapped.description || undefined,
      centroidLat,
      centroidLng,
      avgPriceRupeesPerSqft: avgPrice.value,
      rentalYieldPercent,
      connectivityNotes: mapped.connectivityNotes || undefined,
    },
  };
}
