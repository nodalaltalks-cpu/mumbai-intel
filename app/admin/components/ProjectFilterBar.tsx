"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_LABEL,
  CONFIGURATION_FILTER_OPTIONS,
  POSSESSION_FILTER_OPTIONS,
  PROJECT_SORT_OPTIONS,
  PROJECT_STATUSES,
  PROPERTY_CATEGORIES,
  STATUS_LABEL,
} from "@/lib/project-meta";

const RECENT_SEARCHES_KEY = "mi_admin_recent_project_searches";
const MAX_RECENT = 6;

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function ProjectFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function recordSearch(term: string) {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((s) => s !== term)].slice(0, MAX_RECENT);
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) {
        updateParam("q", q);
        recordSearch(q);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const showArchived = searchParams.get("archived") === "1";

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, tagline, locality, builder…"
        className="w-56 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        value={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">All statuses</option>
        {PROJECT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("category") ?? ""}
        onChange={(e) => updateParam("category", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">All categories</option>
        {PROPERTY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("published") ?? ""}
        onChange={(e) => updateParam("published", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">Published + drafts</option>
        <option value="1">Published only</option>
        <option value="0">Drafts only</option>
        <option value="review">Under review</option>
      </select>
      <select
        value={searchParams.get("featured") ?? ""}
        onChange={(e) => updateParam("featured", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">Featured + standard</option>
        <option value="1">Featured only</option>
      </select>
      <select
        value={searchParams.get("bedrooms") ?? ""}
        onChange={(e) => updateParam("bedrooms", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">Any configuration</option>
        {CONFIGURATION_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        defaultValue={searchParams.get("priceMin") ?? ""}
        onBlur={(e) => updateParam("priceMin", e.target.value)}
        placeholder="Min ₹"
        className="w-24 rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <input
        type="number"
        min={0}
        defaultValue={searchParams.get("priceMax") ?? ""}
        onBlur={(e) => updateParam("priceMax", e.target.value)}
        placeholder="Max ₹"
        className="w-24 rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        value={searchParams.get("possession") ?? ""}
        onChange={(e) => updateParam("possession", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">Any possession</option>
        {POSSESSION_FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("rera") ?? ""}
        onChange={(e) => updateParam("rera", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">RERA: any</option>
        <option value="1">Has RERA</option>
        <option value="0">No RERA</option>
      </select>
      <select
        value={searchParams.get("sort") ?? "updated_desc"}
        onChange={(e) => updateParam("sort", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        {PROJECT_SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => updateParam("archived", showArchived ? "" : "1")}
        className={`rounded-sm border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
          showArchived ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {showArchived ? "Viewing archived" : "Show archived"}
      </button>
      {searchParams.toString() ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
        >
          Clear filters
        </button>
      ) : null}
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
            className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            {term}
          </button>
        ))}
      </div>
    ) : null}
    </div>
  );
}
