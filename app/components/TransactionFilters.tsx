"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { publicSearchAction } from "@/lib/actions/public-search";
import type { PublicSearchResult } from "@/lib/queries";
import {
  CATEGORY_LABEL,
  CONFIGURATION_FILTER_OPTIONS,
  PROPERTY_CATEGORIES,
  TRANSACTION_SORT_OPTIONS,
  type PropertyCategory,
} from "@/lib/project-meta";
import ActiveFilters, { type ActiveFilterChip } from "@/app/components/ui/ActiveFilters";
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
  const [results, setResults] = useState<PublicSearchResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
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

  const numberClass =
    "w-20 rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none";
  const dateInputClass =
    "rounded-sm border border-border bg-surface px-2.5 py-2 text-xs text-foreground transition-colors focus:border-accent focus:outline-none";
  const currentReadiness = searchParams.get("readiness") ?? "";
  const currentSaleType = searchParams.get("type") ?? "";

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
      <div className="flex flex-wrap items-center gap-3">
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

        <select value={searchParams.get("locality") ?? ""} onChange={(e) => updateParam("locality", e.target.value)} className={selectClass} style={selectStyle}>
          <option value="">All localities</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("priceMin") ?? ""}
          onBlur={(e) => updateParam("priceMin", e.target.value)}
          placeholder="Min ₹"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("priceMax") ?? ""}
          onBlur={(e) => updateParam("priceMax", e.target.value)}
          placeholder="Max ₹"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("areaMin") ?? ""}
          onBlur={(e) => updateParam("areaMin", e.target.value)}
          placeholder="Min sqft"
          className={numberClass}
        />
        <input
          type="number"
          min={0}
          defaultValue={searchParams.get("areaMax") ?? ""}
          onBlur={(e) => updateParam("areaMax", e.target.value)}
          placeholder="Max sqft"
          className={numberClass}
        />
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
        <select value={searchParams.get("sort") ?? "date_desc"} onChange={(e) => updateParam("sort", e.target.value)} className={selectClass} style={selectStyle}>
          {TRANSACTION_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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

      <ActiveFilters chips={chips} />
    </div>
  );
}
