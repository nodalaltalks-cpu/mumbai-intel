"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { selectClass, selectStyle } from "@/app/components/ui/formStyles";
import type { GeographyOption } from "@/lib/queries";

/**
 * City/State filter for the Market Snapshot section below. Only two fields,
 * each committed independently — no dual-field race like the price range
 * slider had, so no pendingParamsRef needed here, just a plain param write.
 */
export default function MarketDataFilters({ options }: { options: GeographyOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const states = Array.from(new Map(options.map((o) => [o.stateCode, o.stateName])).entries());
  const selectedState = searchParams.get("state") ?? "";
  const selectedCity = searchParams.get("city") ?? "";
  const citiesForState = selectedState ? options.filter((o) => o.stateCode === selectedState) : options;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    // Selecting a state resets any city choice from a different state.
    if (key === "state") params.delete("city");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  if (options.length <= 1) {
    // Only one geography has any published data yet -- a filter with one
    // option each isn't useful. The UI reappears automatically once a
    // second city/state goes live (City.isLive), no code change needed.
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select value={selectedState} onChange={(e) => updateParam("state", e.target.value)} className={selectClass} style={selectStyle}>
        <option value="">All states</option>
        {states.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <select value={selectedCity} onChange={(e) => updateParam("city", e.target.value)} className={selectClass} style={selectStyle}>
        <option value="">All cities</option>
        {citiesForState.map((o) => (
          <option key={o.citySlug} value={o.citySlug}>
            {o.cityName}
          </option>
        ))}
      </select>
    </div>
  );
}
