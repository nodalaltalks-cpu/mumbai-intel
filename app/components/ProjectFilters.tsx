"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CATEGORY_LABEL,
  CONFIGURATION_FILTER_OPTIONS,
  POSSESSION_FILTER_OPTIONS,
  PROJECT_SORT_OPTIONS,
  PROJECT_STATUSES,
  PROPERTY_CATEGORIES,
  STATUS_LABEL,
  type ProjectStatus,
  type PropertyCategory,
} from "@/lib/project-meta";
import { saveRecentSearch, useRecentSearches } from "@/lib/recent-searches";
import { trackFilterApplied, trackSearchPerformed } from "@/lib/analytics/ga";
import SaveSearchButton from "@/app/components/SaveSearchButton";
import ActiveFilters, { type ActiveFilterChip } from "@/app/components/ui/ActiveFilters";
import Dialog from "@/app/components/ui/Dialog";
import { chipClass, selectClass, selectStyle } from "@/app/components/ui/formStyles";

export interface FilterOption {
  id: string;
  name: string;
}

const QUICK_STATUS_CHIPS = [
  { label: "Ready to Move", status: "READY_TO_MOVE" },
  { label: "Under Construction", status: "UNDER_CONSTRUCTION" },
] as const;

/** Every param a "Filters" click can set — used only to count how many are active for the button badge; search (q) is its own always-visible field, not counted here. */
const FILTER_KEYS = ["locality", "status", "priceMin", "priceMax", "builder", "category", "bedrooms", "possession", "rera", "luxury", "affordable"] as const;

export default function ProjectFilters({ localities, builders }: { localities: FilterOption[]; builders: FilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const recentSearches = useRecentSearches();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
    if (value) {
      if (key === "q") trackSearchPerformed(value);
      else trackFilterApplied("projects", { [key]: value });
    }
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

  const currentStatus = searchParams.get("status") ?? "";
  const isLuxury = searchParams.get("luxury") === "1";
  const isAffordable = searchParams.get("affordable") === "1";
  const activeFilterCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length;

  const chips: ActiveFilterChip[] = [];
  if (searchParams.get("q")) chips.push({ keys: ["q"], label: `Search: "${searchParams.get("q")}"` });
  const localityName = localities.find((l) => l.id === searchParams.get("locality"))?.name;
  if (localityName) chips.push({ keys: ["locality"], label: `Locality: ${localityName}` });
  const builderName = builders.find((b) => b.id === searchParams.get("builder"))?.name;
  if (builderName) chips.push({ keys: ["builder"], label: `Builder: ${builderName}` });
  if (currentStatus) chips.push({ keys: ["status"], label: STATUS_LABEL[currentStatus as ProjectStatus] ?? currentStatus });
  const categoryValue = searchParams.get("category");
  if (categoryValue) chips.push({ keys: ["category"], label: CATEGORY_LABEL[categoryValue as PropertyCategory] ?? categoryValue });
  const bedroomsValue = searchParams.get("bedrooms");
  if (bedroomsValue) chips.push({ keys: ["bedrooms"], label: CONFIGURATION_FILTER_OPTIONS.find((o) => o.value === bedroomsValue)?.label ?? bedroomsValue });
  if (searchParams.get("priceMin") || searchParams.get("priceMax")) {
    chips.push({
      keys: ["priceMin", "priceMax"],
      label: `Price: ₹${searchParams.get("priceMin") ?? "0"} – ₹${searchParams.get("priceMax") ?? "∞"}`,
    });
  }
  const possessionValue = searchParams.get("possession");
  if (possessionValue) {
    chips.push({ keys: ["possession"], label: POSSESSION_FILTER_OPTIONS.find((o) => o.value === possessionValue)?.label ?? possessionValue });
  }
  const reraValue = searchParams.get("rera");
  if (reraValue) chips.push({ keys: ["rera"], label: reraValue === "1" ? "Has RERA" : "No RERA" });
  if (isLuxury) chips.push({ keys: ["luxury"], label: "Luxury" });
  if (isAffordable) chips.push({ keys: ["affordable"], label: "Affordable" });

  return (
    <div className="sticky top-[98px] z-40 rounded-3xl border border-border bg-surface/95 px-4 py-4 shadow-sm backdrop-blur sm:px-6 md:top-[57px]">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects, localities, builders…"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button type="button" onClick={() => setFiltersOpen(true)} className={chipClass(activeFilterCount > 0)}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {chips.length > 0 ? <ActiveFilters chips={chips} /> : null}

      {recentSearches.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

      {filtersOpen ? (
        <Dialog
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <div className="flex items-center justify-between gap-2">
              <SaveSearchButton />
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
              >
                Show results
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <select value={searchParams.get("locality") ?? ""} onChange={(e) => updateParam("locality", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All localities</option>
              {localities.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select value={currentStatus} onChange={(e) => updateParam("status", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <input
                type="number"
                min={0}
                defaultValue={searchParams.get("priceMin") ?? ""}
                onBlur={(e) => updateParam("priceMin", e.target.value)}
                placeholder="Min ₹"
                className="w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="number"
                min={0}
                defaultValue={searchParams.get("priceMax") ?? ""}
                onBlur={(e) => updateParam("priceMax", e.target.value)}
                placeholder="Max ₹"
                className="w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <select value={searchParams.get("sort") ?? "updated_desc"} onChange={(e) => updateParam("sort", e.target.value)} className={selectClass} style={selectStyle}>
              {PROJECT_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={searchParams.get("builder") ?? ""} onChange={(e) => updateParam("builder", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All builders</option>
              {builders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select value={searchParams.get("category") ?? ""} onChange={(e) => updateParam("category", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All categories</option>
              {PROPERTY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <select value={searchParams.get("bedrooms") ?? ""} onChange={(e) => updateParam("bedrooms", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">Any configuration</option>
              {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={searchParams.get("possession") ?? ""} onChange={(e) => updateParam("possession", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">Any possession</option>
              {POSSESSION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select value={searchParams.get("rera") ?? ""} onChange={(e) => updateParam("rera", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">RERA: any</option>
              <option value="1">Has RERA</option>
              <option value="0">No RERA</option>
            </select>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {QUICK_STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.status}
                  type="button"
                  onClick={() => updateParam("status", currentStatus === chip.status ? "" : chip.status)}
                  className={chipClass(currentStatus === chip.status)}
                >
                  {chip.label}
                </button>
              ))}
              <button type="button" onClick={() => updateParam("luxury", isLuxury ? "" : "1")} className={chipClass(isLuxury)}>
                Luxury
              </button>
              <button type="button" onClick={() => updateParam("affordable", isAffordable ? "" : "1")} className={chipClass(isAffordable)}>
                Affordable
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
