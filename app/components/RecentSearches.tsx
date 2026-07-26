"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { RECENT_SEARCHES_EVENT } from "@/lib/recent-searches";

const STORAGE_KEY = "mi:recent-searches";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(RECENT_SEARCHES_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(RECENT_SEARCHES_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
}

function getServerSnapshot() {
  return "[]";
}

function parseSearches(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function RecentSearches() {
  const router = useRouter();
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const searches = parseSearches(raw);

  function clearAll() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(RECENT_SEARCHES_EVENT));
  }

  if (searches.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted">Recent</span>
      {searches.map((term) => (
        <button
          key={term}
          type="button"
          onClick={() => router.push(`/projects?q=${encodeURIComponent(term)}`)}
          className="rounded-full border border-border px-3 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {term}
        </button>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted transition-colors hover:border-negative hover:text-negative"
      >
        Clear
      </button>
    </div>
  );
}
