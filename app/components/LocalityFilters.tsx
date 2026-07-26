"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS, PROPERTY_CATEGORIES, type PropertyCategory } from "@/lib/project-meta";
import ActiveFilters, { type ActiveFilterChip } from "@/app/components/ui/ActiveFilters";
import { chipClass, selectClass, selectStyle } from "@/app/components/ui/formStyles";

const SALE_TYPE_CHIPS = [
  { label: "Sale", value: "sale" },
  { label: "Rental", value: "rental" },
] as const;

export default function LocalityFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}#market`);
  }

  const dateInputClass =
    "rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground transition-colors focus:border-accent focus:outline-none";
  const currentSaleType = searchParams.get("type") ?? "";

  const chips: ActiveFilterChip[] = [];
  if (searchParams.get("dateFrom") || searchParams.get("dateTo")) {
    chips.push({
      keys: ["dateFrom", "dateTo"],
      label: `Date: ${searchParams.get("dateFrom") ?? "…"} – ${searchParams.get("dateTo") ?? "…"}`,
    });
  }
  const bedroomsValue = searchParams.get("bedrooms");
  if (bedroomsValue) chips.push({ keys: ["bedrooms"], label: CONFIGURATION_FILTER_OPTIONS.find((o) => o.value === bedroomsValue)?.label ?? bedroomsValue });
  const categoryValue = searchParams.get("category");
  if (categoryValue) chips.push({ keys: ["category"], label: CATEGORY_LABEL[categoryValue as PropertyCategory] ?? categoryValue });
  if (currentSaleType) chips.push({ keys: ["type"], label: currentSaleType === "sale" ? "Sale" : "Rental" });

  return (
    <div className="sticky top-[57px] z-40 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted">Filter this locality&apos;s data</span>
        <input
          type="date"
          defaultValue={searchParams.get("dateFrom") ?? ""}
          onChange={(e) => updateParam("dateFrom", e.target.value)}
          className={dateInputClass}
        />
        <input
          type="date"
          defaultValue={searchParams.get("dateTo") ?? ""}
          onChange={(e) => updateParam("dateTo", e.target.value)}
          className={dateInputClass}
        />
        <select value={searchParams.get("bedrooms") ?? ""} onChange={(e) => updateParam("bedrooms", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">Any configuration</option>
          {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select value={searchParams.get("category") ?? ""} onChange={(e) => updateParam("category", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All property types</option>
          {PROPERTY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        {SALE_TYPE_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => updateParam("type", currentSaleType === chip.value ? "" : chip.value)}
            className={chipClass(currentSaleType === chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <ActiveFilters chips={chips} />
    </div>
  );
}
