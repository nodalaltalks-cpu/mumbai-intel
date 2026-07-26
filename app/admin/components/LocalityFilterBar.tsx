"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SORT_OPTIONS = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "projects_desc", label: "Most projects" },
  { value: "price_desc", label: "Price: High to Low" },
] as const;

export default function LocalityFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
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
      if (q !== (searchParams.get("q") ?? "")) updateParam("q", q);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const showArchived = searchParams.get("archived") === "1";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, pincode…"
        className="w-56 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        value={searchParams.get("published") ?? ""}
        onChange={(e) => updateParam("published", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        <option value="">Published + drafts</option>
        <option value="1">Published only</option>
        <option value="0">Drafts only</option>
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
        value={searchParams.get("sort") ?? "updated_desc"}
        onChange={(e) => updateParam("sort", e.target.value)}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
      >
        {SORT_OPTIONS.map((opt) => (
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
  );
}
