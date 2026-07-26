"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface SavedFilter {
  name: string;
  query: string;
}

const STORAGE_KEY = "mi_admin_saved_filters_projects";

function readSaved(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
  } catch {
    return [];
  }
}

export default function SavedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState<SavedFilter[]>(() => readSaved());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  function saveCurrent() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const query = searchParams.toString();
    setSaved((prev) => [...prev.filter((f) => f.name !== trimmed), { name: trimmed, query }]);
    setName("");
    setNaming(false);
  }

  function remove(target: string) {
    setSaved((prev) => prev.filter((f) => f.name !== target));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {saved.map((filter) => (
        <span
          key={filter.name}
          className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11px] font-mono text-muted"
        >
          <button type="button" onClick={() => router.push(`${pathname}?${filter.query}`)} className="hover:text-accent">
            {filter.name}
          </button>
          <button type="button" onClick={() => remove(filter.name)} className="text-muted hover:text-negative" aria-label={`Delete saved filter ${filter.name}`}>
            ×
          </button>
        </span>
      ))}

      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrent();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="Filter name"
            className="w-28 rounded-sm border border-border bg-surface px-2 py-1 text-[11px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button type="button" onClick={saveCurrent} className="rounded-sm border border-accent/40 px-1.5 py-1 text-[11px] text-accent">
            Save
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="rounded-sm border border-dashed border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          + Save current filters
        </button>
      )}
    </div>
  );
}
