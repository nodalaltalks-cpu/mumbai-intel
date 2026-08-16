"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearchAction } from "@/lib/actions/search";
import type { GlobalSearchResult } from "@/lib/admin-queries";

const QUICK_LINKS = [
  { label: "New Project", href: "/admin/projects/new", group: "Quick add" },
  { label: "New Transaction", href: "/admin/transactions/new", group: "Quick add" },
  { label: "Dashboard", href: "/admin", group: "Navigate" },
  { label: "Projects", href: "/admin/projects", group: "Navigate" },
  { label: "Builders", href: "/admin/builders", group: "Navigate" },
  { label: "Localities", href: "/admin/localities", group: "Navigate" },
  { label: "Transactions", href: "/admin/transactions", group: "Navigate" },
  { label: "Price Trends", href: "/admin/price-trends", group: "Navigate" },
  { label: "Market Intelligence", href: "/admin/market-intelligence", group: "Navigate" },
  { label: "Users", href: "/admin/users", group: "Navigate" },
  { label: "Settings", href: "/admin/settings", group: "Navigate" },
];

const RECENT_SEARCHES_KEY = "mi_admin_recent_searches";

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  const existing = readRecentSearches().filter((q) => q.toLowerCase() !== query.toLowerCase());
  const next = [query, ...existing].slice(0, 6);
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

interface FlatItem {
  key: string;
  label: string;
  sublabel?: string;
  href: string;
  group: string;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [recent] = useState<string[]>(() => readRecentSearches());
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
        return;
      }
      globalSearchAction(query).then(setResults);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const items: FlatItem[] = useMemo(() => {
    if (!query.trim()) {
      return QUICK_LINKS.map((l) => ({ key: l.href, label: l.label, href: l.href, group: l.group }));
    }
    if (!results) return [];
    const out: FlatItem[] = [];
    for (const p of results.projects) out.push({ key: `p-${p.id}`, label: p.name, sublabel: "Project", href: `/admin/projects/${p.id}/edit`, group: "Projects" });
    for (const b of results.builders) out.push({ key: `b-${b.id}`, label: b.name, sublabel: "Builder", href: `/admin/builders/${b.id}/edit`, group: "Builders" });
    for (const l of results.localities) out.push({ key: `l-${l.id}`, label: l.name, sublabel: "Locality", href: `/admin/localities/${l.id}/edit`, group: "Localities" });
    return out;
  }, [query, results]);

  function navigate(href: string) {
    if (query.trim()) pushRecentSearch(query.trim());
    onClose();
    router.push(href);
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
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  const groupedRender: { group: string; items: FlatItem[] }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.group)) {
      seen.add(item.group);
      groupedRender.push({ group: item.group, items: [] });
    }
    groupedRender.find((g) => g.group === item.group)!.items.push(item);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="font-mono text-xs text-muted">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, builders, localities… or jump to a page"
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
                  onClick={() => setQuery(r)}
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
                    {item.sublabel ? <span className="text-[10px] uppercase tracking-wide text-muted">{item.sublabel}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
