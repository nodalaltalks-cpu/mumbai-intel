"use client";

import { useMemo, useRef, useState } from "react";
import type { LocalityMapMarker, MapMarker } from "@/lib/map/types";

interface SearchResult {
  key: string;
  label: string;
  sublabel: string;
  marker: MapMarker;
}

/** Client-side search over the already-loaded marker datasets — instant, no network round-trip. */
export default function MapSearch({ localities, onSelect }: { localities: LocalityMapMarker[]; onSelect: (marker: MapMarker) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    const out: SearchResult[] = [];
    for (const l of localities) {
      if (l.name.toLowerCase().includes(trimmed)) {
        out.push({ key: `locality-${l.id}`, label: l.name, sublabel: "Locality", marker: l });
      }
    }
    return out.slice(0, 8);
  }, [query, localities]);

  function handleSelect(result: SearchResult) {
    setQuery(result.label);
    setOpen(false);
    onSelect(result.marker);
  }

  return (
    <div ref={boxRef} className="relative w-full sm:w-72">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search locality…"
        className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {open && results.length > 0 ? (
        <div className="absolute left-0 top-full z-[1000] mt-1 w-full overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
          <div className="max-h-72 overflow-y-auto p-1.5">
            {results.map((r) => (
              <button
                key={r.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(r)}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
              >
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{r.sublabel}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
