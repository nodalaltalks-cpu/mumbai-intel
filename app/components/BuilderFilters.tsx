"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BUILDER_SORT_OPTIONS } from "@/lib/project-meta";
import { saveRecentSearch, useRecentSearches } from "@/lib/recent-searches";
import ActiveFilters, { type ActiveFilterChip } from "@/app/components/ui/ActiveFilters";
import { selectClass, selectStyle } from "@/app/components/ui/formStyles";

export interface FilterOption {
  id: string;
  name: string;
}

export default function BuilderFilters({ cities }: { cities: FilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const recentSearches = useRecentSearches();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) {
        updateParam("q", q);
        if (q.trim()) {
          saveRecentSearch(q);
        }
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const numberClass =
    "w-24 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none";

  const chips: ActiveFilterChip[] = [];
  if (searchParams.get("q")) chips.push({ keys: ["q"], label: `Search: "${searchParams.get("q")}"` });
  const cityName = cities.find((c) => c.id === searchParams.get("city"))?.name;
  if (cityName) chips.push({ keys: ["city"], label: `City: ${cityName}` });
  if (searchParams.get("minActive")) chips.push({ keys: ["minActive"], label: `Min active: ${searchParams.get("minActive")}` });
  if (searchParams.get("minDelivered")) chips.push({ keys: ["minDelivered"], label: `Min delivered: ${searchParams.get("minDelivered")}` });
  if (searchParams.get("priceMin") || searchParams.get("priceMax")) {
    chips.push({
      keys: ["priceMin", "priceMax"],
      label: `Starting price: ₹${searchParams.get("priceMin") ?? "0"} – ₹${searchParams.get("priceMax") ?? "∞"}`,
    });
  }

  return (
    <div className="sticky top-[98px] z-40 rounded-3xl border border-border bg-surface/95 px-4 py-4 shadow-sm backdrop-blur sm:px-6 md:top-[57px]">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search developers, headquarters…"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select value={searchParams.get("city") ?? ""} onChange={(e) => updateParam("city", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("minActive") ?? ""}
          onBlur={(e) => updateParam("minActive", e.target.value)}
          placeholder="Min active projects"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("minDelivered") ?? ""}
          onBlur={(e) => updateParam("minDelivered", e.target.value)}
          placeholder="Min delivered"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("priceMin") ?? ""}
          onBlur={(e) => updateParam("priceMin", e.target.value)}
          placeholder="Min starting ₹"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("priceMax") ?? ""}
          onBlur={(e) => updateParam("priceMax", e.target.value)}
          placeholder="Max starting ₹"
          className={numberClass}
        />
        <select value={searchParams.get("sort") ?? "updated_desc"} onChange={(e) => updateParam("sort", e.target.value)} className={selectClass} style={selectStyle}>
          {BUILDER_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {recentSearches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted">Recent:</span>
          {recentSearches.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setQ(term);
                updateParam("q", term);
              }}
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {term}
            </button>
          ))}
        </div>
      ) : null}

      <ActiveFilters chips={chips} />
    </div>
  );
}
