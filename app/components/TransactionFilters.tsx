"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { publicSearchAction } from "@/lib/actions/public-search";
import { trackFilterApplied, trackSearchPerformed } from "@/lib/analytics/ga";
import type { PublicSearchResult } from "@/lib/queries";
import {
  CATEGORY_LABEL,
  CONFIGURATION_FILTER_OPTIONS,
  PROPERTY_CATEGORIES,
  TRANSACTION_SORT_OPTIONS,
  type PropertyCategory,
} from "@/lib/project-meta";
import ActiveFilters, { type ActiveFilterChip } from "@/app/components/ui/ActiveFilters";
import Dialog from "@/app/components/ui/Dialog";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
import { chipClass, selectClass, selectStyle } from "@/app/components/ui/formStyles";

export interface FilterOption {
  id: string;
  name: string;
}

interface AutocompleteItem {
  key: string;
  label: string;
  sublabel: string;
  group: string;
  apply: () => void;
}

const READINESS_CHIPS = [
  { label: "Ready to Move", value: "ready" },
  { label: "Under Construction", value: "under_construction" },
] as const;

const SALE_TYPE_CHIPS = [
  { label: "Sale", value: "sale" },
  { label: "Rental", value: "rental" },
] as const;

/** Every param a "Filters" click can set — used only for the button's active-count badge; search (q) is its own always-visible field, not counted here. */
const FILTER_KEYS = [
  "locality",
  "builder",
  "project",
  "category",
  "bedrooms",
  "priceMin",
  "priceMax",
  "areaMin",
  "areaMax",
  "dateFrom",
  "dateTo",
  "type",
  "readiness",
] as const;

export default function TransactionFilters({
  localities,
  builders,
  projects,
}: {
  localities: FilterOption[];
  builders: FilterOption[];
  projects: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [results, setResults] = useState<PublicSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Same fix already proven on ProjectFilters.tsx / /projects: tracks the
  // last params this component itself asked the router to navigate to,
  // rather than trusting window.location.search, which can lag a push by
  // however long that navigation's data fetch takes. Two changes fired close
  // together (e.g. the price range's From then To field) would otherwise
  // both build off the same stale pre-navigation URL and the second push
  // would silently overwrite the first's change instead of merging with it.
  const pendingParamsRef = useRef<URLSearchParams | null>(null);

  useEffect(() => {
    pendingParamsRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function currentParams(): URLSearchParams {
    return new URLSearchParams((pendingParamsRef.current ?? new URLSearchParams(window.location.search)).toString());
  }

  function updateParams(updates: Record<string, string>) {
    const params = currentParams();
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    pendingParamsRef.current = params;
    router.push(`${pathname}?${params.toString()}`);
    const applied = Object.entries(updates).filter(([, value]) => value);
    const qUpdate = applied.find(([key]) => key === "q");
    if (qUpdate) trackSearchPerformed(qUpdate[1]);
    const otherFilters = applied.filter(([key]) => key !== "q");
    if (otherFilters.length > 0) trackFilterApplied("transactions", Object.fromEntries(otherFilters));
  }

  function updateParam(key: string, value: string) {
    updateParams({ [key]: value });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults(null);
        return;
      }
      publicSearchAction(trimmed).then((r) => {
        setResults(r);
        setActiveIndex(0);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const items: AutocompleteItem[] = [];
  if (results) {
    for (const p of results.projects) {
      items.push({
        key: `p-${p.id}`,
        label: p.name,
        sublabel: `Project · ${p.localityName}`,
        group: "Projects",
        apply: () => {
          setQ(p.name);
          setShowDropdown(false);
          updateParams({ q: "", project: p.id });
        },
      });
    }
    for (const b of results.builders) {
      items.push({
        key: `b-${b.id}`,
        label: b.name,
        sublabel: "Builder",
        group: "Builders",
        apply: () => {
          setQ(b.name);
          setShowDropdown(false);
          updateParams({ q: "", builder: b.id });
        },
      });
    }
    for (const l of results.localities) {
      items.push({
        key: `l-${l.id}`,
        label: l.name,
        sublabel: "Locality",
        group: "Localities",
        apply: () => {
          setQ(l.name);
          setShowDropdown(false);
          updateParams({ q: "", locality: l.id });
        },
      });
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || items.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        setShowDropdown(false);
        updateParam("q", q);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) item.apply();
      else {
        setShowDropdown(false);
        updateParam("q", q);
      }
    } else if (event.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const grouped: { group: string; items: AutocompleteItem[] }[] = [];
  for (const item of items) {
    let bucket = grouped.find((g) => g.group === item.group);
    if (!bucket) {
      bucket = { group: item.group, items: [] };
      grouped.push(bucket);
    }
    bucket.items.push(item);
  }

  const dateInputClass =
    "rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground transition-colors focus:border-accent focus:outline-none";
  const currentReadiness = searchParams.get("readiness") ?? "";
  const currentSaleType = searchParams.get("type") ?? "";
  const activeFilterCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length;

  const chips: ActiveFilterChip[] = [];
  if (searchParams.get("q")) chips.push({ keys: ["q"], label: `Search: "${searchParams.get("q")}"` });
  const localityName = localities.find((l) => l.id === searchParams.get("locality"))?.name;
  if (localityName) chips.push({ keys: ["locality"], label: `Locality: ${localityName}` });
  const builderName = builders.find((b) => b.id === searchParams.get("builder"))?.name;
  if (builderName) chips.push({ keys: ["builder"], label: `Builder: ${builderName}` });
  const projectName = projects.find((p) => p.id === searchParams.get("project"))?.name;
  if (projectName) chips.push({ keys: ["project"], label: `Project: ${projectName}` });
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
  if (searchParams.get("areaMin") || searchParams.get("areaMax")) {
    chips.push({
      keys: ["areaMin", "areaMax"],
      label: `Area: ${searchParams.get("areaMin") ?? "0"} – ${searchParams.get("areaMax") ?? "∞"} sqft`,
    });
  }
  if (searchParams.get("dateFrom") || searchParams.get("dateTo")) {
    chips.push({
      keys: ["dateFrom", "dateTo"],
      label: `Date: ${searchParams.get("dateFrom") ?? "…"} – ${searchParams.get("dateTo") ?? "…"}`,
    });
  }
  if (currentSaleType) chips.push({ keys: ["type"], label: currentSaleType === "sale" ? "Sale" : "Rental" });
  if (currentReadiness) {
    chips.push({ keys: ["readiness"], label: currentReadiness === "ready" ? "Ready to Move" : "Under Construction" });
  }

  return (
    <div className="sticky top-[98px] z-40 rounded-3xl border border-border bg-surface/95 px-4 py-4 shadow-sm backdrop-blur sm:px-6 md:top-[57px]">
      <div className="flex items-center gap-3">
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search project, builder, locality…"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {showDropdown && items.length > 0 ? (
            <div className="mi-pop-in absolute left-0 top-full z-50 mt-1 w-72 origin-top overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
              <div className="max-h-80 overflow-y-auto p-1.5">
                {grouped.map((group) => (
                  <div key={group.group} className="mb-1">
                    <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted/60">{group.group}</p>
                    {group.items.map((item) => {
                      const globalIndex = items.indexOf(item);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onClick={item.apply}
                          className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors ${
                            globalIndex === activeIndex ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface-raised"
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{item.sublabel}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <button type="button" onClick={() => setFiltersOpen(true)} className={chipClass(activeFilterCount > 0)}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {chips.length > 0 ? <ActiveFilters chips={chips} /> : null}

      {filtersOpen ? (
        <Dialog
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="w-full rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
            >
              Show results
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            {/* Primary filters — Location, Price, Date — first, per the simplified-filter spec. */}
            <select value={searchParams.get("locality") ?? ""} onChange={(e) => updateParam("locality", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All localities</option>
              {localities.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <PriceRangeFilter
              minRupees={searchParams.get("priceMin") ? Number(searchParams.get("priceMin")) : null}
              maxRupees={searchParams.get("priceMax") ? Number(searchParams.get("priceMax")) : null}
              onCommit={(min, max) => updateParams({ priceMin: min !== null ? String(min) : "", priceMax: max !== null ? String(max) : "" })}
            />

            <div className="flex gap-3">
              <input
                type="date"
                defaultValue={searchParams.get("dateFrom") ?? ""}
                onChange={(e) => updateParam("dateFrom", e.target.value)}
                className={`w-full ${dateInputClass}`}
                aria-label="From date"
              />
              <input
                type="date"
                defaultValue={searchParams.get("dateTo") ?? ""}
                onChange={(e) => updateParam("dateTo", e.target.value)}
                className={`w-full ${dateInputClass}`}
                aria-label="To date"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
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
              <span className="mx-1 h-4 w-px bg-border" />
              {READINESS_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => updateParam("readiness", currentReadiness === chip.value ? "" : chip.value)}
                  className={chipClass(currentReadiness === chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Secondary filters. */}
            <select value={searchParams.get("builder") ?? ""} onChange={(e) => updateParam("builder", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All builders</option>
              {builders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select value={searchParams.get("project") ?? ""} onChange={(e) => updateParam("project", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
            <select value={searchParams.get("bedrooms") ?? ""} onChange={(e) => updateParam("bedrooms", e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">Any configuration</option>
              {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <input
                type="number"
                min={0}
                defaultValue={searchParams.get("areaMin") ?? ""}
                onBlur={(e) => updateParam("areaMin", e.target.value)}
                placeholder="Min sqft"
                className="w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="number"
                min={0}
                defaultValue={searchParams.get("areaMax") ?? ""}
                onBlur={(e) => updateParam("areaMax", e.target.value)}
                placeholder="Max sqft"
                className="w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <select value={searchParams.get("sort") ?? "date_desc"} onChange={(e) => updateParam("sort", e.target.value)} className={selectClass} style={selectStyle}>
              {TRANSACTION_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
