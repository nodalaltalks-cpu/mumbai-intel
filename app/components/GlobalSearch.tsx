"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { publicSearchAction } from "@/lib/actions/public-search";
import type { PublicSearchResult } from "@/lib/queries";
import { saveRecentSearch, useRecentSearches } from "@/lib/recent-searches";
import { trackSearchPerformed } from "@/lib/analytics/ga";
import { IconChevronRight, IconSearch } from "@/app/components/ui/icons";

interface FlatItem {
  key: string;
  label: string;
  sublabel: string;
  href: string;
  group: string;
}

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicSearchResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const recent = useRecentSearches();
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!query.trim()) {
        setResults(null);
        setIsPending(false);
        return;
      }
      publicSearchAction(query)
        .then((result) => {
          setResults(result);
          trackSearchPerformed(query, result.projects.length + result.builders.length + result.localities.length);
        })
        .finally(() => setIsPending(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const items: FlatItem[] = useMemo(() => {
    if (!results) return [];
    const out: FlatItem[] = [];
    for (const p of results.projects) out.push({ key: `p-${p.id}`, label: p.name, sublabel: p.localityName, href: `/projects/${p.slug}`, group: "Projects" });
    for (const b of results.builders) out.push({ key: `b-${b.id}`, label: b.name, sublabel: "Builder", href: `/builders/${b.slug}`, group: "Builders" });
    for (const l of results.localities) out.push({ key: `l-${l.id}`, label: l.name, sublabel: "Locality", href: `/localities/${l.slug}`, group: "Localities" });
    return out;
  }, [results]);

  function navigate(href: string) {
    if (query.trim()) saveRecentSearch(query.trim());
    onClose();
    router.push(href);
  }

  function goToAllResults() {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveRecentSearch(trimmed);
    onClose();
    router.push(`/projects?q=${encodeURIComponent(trimmed)}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) navigate(item.href);
      else goToAllResults();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const groupedRender: { group: string; items: FlatItem[] }[] = [];
  for (const item of items) {
    let bucket = groupedRender.find((g) => g.group === item.group);
    if (!bucket) {
      bucket = { group: item.group, items: [] };
      groupedRender.push(bucket);
    }
    bucket.items.push(item);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="mi-fade-in fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="mi-pop-in w-full max-w-lg overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          {isPending ? (
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden="true" />
          ) : (
            <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setIsPending(Boolean(e.target.value.trim()));
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, builders, localities…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-wide text-muted hover:text-foreground">
            Esc
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {!query.trim() && recent.length > 0 ? (
            <div className="mb-2">
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted/60">Recent searches</p>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setQuery(r);
                    setIsPending(true);
                  }}
                  className="block w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-raised hover:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}

          {items.length === 0 && query.trim() ? (
            <p className="px-2 py-6 text-center text-xs text-muted">No matches for &ldquo;{query}&rdquo;</p>
          ) : null}

          {groupedRender.map((group) => (
            <div key={group.group} className="mb-1">
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted/60">{group.group}</p>
              {group.items.map((item) => {
                const globalIndex = items.indexOf(item);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => navigate(item.href)}
                    className={`flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-xs transition-colors ${
                      globalIndex === activeIndex ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface-raised"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted">{item.sublabel}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {query.trim() ? (
            <button
              type="button"
              onClick={goToAllResults}
              className="mt-1 flex w-full items-center justify-between rounded-sm border-t border-border px-2 py-2.5 text-left text-xs text-accent transition-colors hover:bg-surface-raised"
            >
              See all results for &ldquo;{query}&rdquo;
              <IconChevronRight className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
