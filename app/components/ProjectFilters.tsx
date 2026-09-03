"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
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
  // Everything inside the Filters panel edits this draft, not the URL --
  // nothing is "applied" until Show Results commits it. Opening the panel
  // snapshots the currently-applied params as the starting draft (so it
  // shows what's already applied); closing any other way (×, backdrop tap,
  // Android/browser back — all funnel through Dialog's one onClose prop)
  // just discards it. Fields outside the panel (the search box, Recent
  // chips) are unaffected and keep applying immediately, same as before.
  const [draftParams, setDraftParams] = useState<URLSearchParams | null>(null);
  const recentSearches = useRecentSearches();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pendingParamsRef tracks the params this component last asked the router
  // to navigate to -- NOT what window.location.search currently shows.
  // Confirmed by direct testing against this project's real (remote, often
  // multi-second-latency) Neon database: router.push()'s visible URL update
  // lags behind the call by however long that navigation's data fetch takes,
  // not just a render tick. Two filter changes fired within that window
  // (e.g. typing the price range's From field, then its To field a few
  // hundred ms later) would otherwise both build off the same stale
  // pre-navigation URL and the second push would silently overwrite the
  // first's change instead of merging with it. Building from the last
  // *intended* params instead of the live URL sidesteps that regardless of
  // how long the underlying navigation takes to actually land.
  const pendingParamsRef = useRef<URLSearchParams | null>(null);

  function currentParams(): URLSearchParams {
    return new URLSearchParams((pendingParamsRef.current ?? new URLSearchParams(window.location.search)).toString());
  }

  function pushParams(params: URLSearchParams) {
    pendingParamsRef.current = params;
    router.push(`${pathname}?${params.toString()}`);
  }

  // Once ANY navigation lands (ours or, e.g., the ActiveFilters chip row's
  // own independent router.push for clearing a filter), searchParams here
  // re-renders with fresh values -- at that point window.location.search is
  // authoritative again, so drop the pending override rather than let it
  // keep masking an external change indefinitely.
  useEffect(() => {
    pendingParamsRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function updateParam(key: string, value: string) {
    const params = currentParams();
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    pushParams(params);
    if (value) {
      if (key === "q") trackSearchPerformed(value);
      else trackFilterApplied("projects", { [key]: value });
    }
  }

  /** Sets multiple params in one push — used by the price range slider, whose From/To values must land in the same URL update even when they're committed as two separate blur events. */
  function updateParams(entries: Record<string, string>) {
    const params = currentParams();
    for (const [key, value] of Object.entries(entries)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    pushParams(params);
    for (const [key, value] of Object.entries(entries)) {
      if (value) trackFilterApplied("projects", { [key]: value });
    }
  }

  /** Opens the Filters panel with a snapshot of the currently-applied params as the starting draft. */
  function openFilters() {
    setDraftParams(new URLSearchParams(searchParams.toString()));
    setFiltersOpen(true);
  }

  /** The one non-committing close path — × button, backdrop tap, and back button (Dialog's shared onClose) all route here, so all three discard the draft identically. */
  function closeFiltersWithoutApplying() {
    setFiltersOpen(false);
    setDraftParams(null);
  }

  function updateDraft(key: string, value: string) {
    setDraftParams((prev) => {
      const next = new URLSearchParams((prev ?? searchParams).toString());
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  function updateDraftMulti(entries: Record<string, string>) {
    setDraftParams((prev) => {
      const next = new URLSearchParams((prev ?? searchParams).toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  /** Commits the draft to the URL in one push (Show Results) — the only thing that changed from before is *when* a field's edit reaches the router, not the push mechanism itself. A no-op if nothing actually changed. */
  function applyFilters() {
    if (draftParams) {
      const next = new URLSearchParams(draftParams.toString());
      next.delete("page");
      const before = new URLSearchParams(searchParams.toString());
      before.delete("page");
      if (next.toString() !== before.toString()) {
        // Neutralize the Filters dialog's own back-button history marker
        // (pushed by useModalBackClose while it was open) before navigating.
        // pushParams' router.push actually calls history.pushState
        // asynchronously and can land after this handler returns, so
        // without this, closing the dialog right below (setFiltersOpen(false)
        // unmounts it) runs useModalBackClose's cleanup while history.state
        // still looks like its own marker -- which makes it call
        // history.back() to consume it, silently undoing this very push a
        // moment later.
        if ((history.state as { modal?: boolean } | null)?.modal) history.replaceState(null, "");
        pushParams(next);
        for (const key of FILTER_KEYS) {
          const value = next.get(key);
          if (value && value !== (searchParams.get(key) ?? "")) trackFilterApplied("projects", { [key]: value });
        }
      }
    }
    setFiltersOpen(false);
    setDraftParams(null);
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
  if (currentStatus) chips.push({ keys: ["status"], label: currentStatus === "all" ? "All statuses (incl. Ready to Move, Delivered)" : STATUS_LABEL[currentStatus as ProjectStatus] ?? currentStatus });
  const categoryValue = searchParams.get("category");
  if (categoryValue) chips.push({ keys: ["category"], label: categoryValue === "all" ? "All categories" : CATEGORY_LABEL[categoryValue as PropertyCategory] ?? categoryValue });
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
        <button type="button" onClick={openFilters} className={chipClass(activeFilterCount > 0)}>
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

      {filtersOpen
        ? (() => {
            const draftStatus = draftParams?.get("status") ?? "";
            const draftLuxury = draftParams?.get("luxury") === "1";
            const draftAffordable = draftParams?.get("affordable") === "1";
            return createPortal(
              <Dialog title="Filters" onClose={closeFiltersWithoutApplying} largeCloseButton
                footer={
                  <div className="flex items-center justify-between gap-2">
                    <SaveSearchButton />
                    <button
                      type="button"
                      onClick={applyFilters}
                      className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
                    >
                      Show results
                    </button>
                  </div>
                }
              >
                <div className="flex flex-col gap-3">
                  <select value={draftParams?.get("locality") ?? ""} onChange={(e) => updateDraft("locality", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">All localities</option>
                    {localities.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <select value={draftStatus} onChange={(e) => updateDraft("status", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="all">All statuses</option>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <PriceRangeFilter
                    minRupees={draftParams?.get("priceMin") ? Number(draftParams.get("priceMin")) : null}
                    maxRupees={draftParams?.get("priceMax") ? Number(draftParams.get("priceMax")) : null}
                    onCommit={(min, max) =>
                      updateDraftMulti({ priceMin: min !== null ? String(min) : "", priceMax: max !== null ? String(max) : "" })
                    }
                  />
                  <select value={draftParams?.get("sort") ?? "updated_desc"} onChange={(e) => updateDraft("sort", e.target.value)} className={selectClass} style={selectStyle}>
                    {PROJECT_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select value={draftParams?.get("builder") ?? ""} onChange={(e) => updateDraft("builder", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">All builders</option>
                    {builders.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <select value={draftParams?.get("category") ?? ""} onChange={(e) => updateDraft("category", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="all">All categories</option>
                    {PROPERTY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <select value={draftParams?.get("bedrooms") ?? ""} onChange={(e) => updateDraft("bedrooms", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">Any configuration</option>
                    {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select value={draftParams?.get("possession") ?? ""} onChange={(e) => updateDraft("possession", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">Any possession</option>
                    {POSSESSION_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select value={draftParams?.get("rera") ?? ""} onChange={(e) => updateDraft("rera", e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">RERA: any</option>
                    <option value="1">Has RERA</option>
                    <option value="0">No RERA</option>
                  </select>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {QUICK_STATUS_CHIPS.map((chip) => (
                      <button
                        key={chip.status}
                        type="button"
                        onClick={() => updateDraft("status", draftStatus === chip.status ? "" : chip.status)}
                        className={chipClass(draftStatus === chip.status)}
                      >
                        {chip.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => updateDraft("luxury", draftLuxury ? "" : "1")} className={chipClass(draftLuxury)}>
                      Luxury
                    </button>
                    <button type="button" onClick={() => updateDraft("affordable", draftAffordable ? "" : "1")} className={chipClass(draftAffordable)}>
                      Affordable
                    </button>
                  </div>
                </div>
              </Dialog>,
              document.body
            );
          })()
        : null}
    </div>
  );
}
