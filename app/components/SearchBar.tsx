"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveRecentSearch } from "@/lib/recent-searches";
import Button from "@/app/components/ui/Button";
import { IconSearch } from "@/app/components/ui/icons";

const CATEGORIES = ["All", "Residential", "Commercial", "Plot"] as const;
const STATUSES = ["Any status", "Under Construction", "Ready to Move", "Pre-Launch"] as const;

export interface SearchBarLocality {
  slug: string;
  name: string;
  zoneName: string | null;
}

export default function SearchBar({ localities }: { localities: SearchBarLocality[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Any status");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) {
      saveRecentSearch(trimmed);
      params.set("q", trimmed);
    }
    if (category !== "All") params.set("category", category.toUpperCase());
    if (status !== "Any status") params.set("status", status.replace(/\s+/g, "_").toUpperCase());
    router.push(`/projects${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="grid gap-3 rounded-3xl border border-border bg-surface px-4 py-4 shadow-md sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-center gap-3">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, localities, or builders..."
            list="mi-locality-options"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted transition-colors focus:border-accent focus:outline-none"
          />
          <datalist id="mi-locality-options">
            {localities.map((locality) => (
              <option key={locality.slug} value={locality.name} />
            ))}
          </datalist>
        </div>
        <Button type="submit" size="md" className="shrink-0">
          Search
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ${
                category === option
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="hidden h-4 w-px bg-border sm:block" />
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatus(option)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ${
                status === option
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
