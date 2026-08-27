"use client";

import { useEffect, useState } from "react";

/**
 * Client-only, localStorage-backed Compare list — anonymous-friendly (no
 * sign-in required). Stores project slugs, since that's already the stable
 * public identifier used by every project link on the site.
 */
const KEY = "mi:compare-list";
const EVENT = "mi:compare-list-updated";
export const COMPARE_LIST_MAX = 4;

export function readCompareList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(next: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage unavailable (private browsing, quota) — no-op
  }
}

/** Adds/removes a project slug. Returns the new membership state and whether the list was full (add rejected). */
export function toggleCompareItem(slug: string): { inList: boolean; full: boolean } {
  const existing = readCompareList();
  if (existing.includes(slug)) {
    write(existing.filter((s) => s !== slug));
    return { inList: false, full: false };
  }
  if (existing.length >= COMPARE_LIST_MAX) {
    return { inList: false, full: true };
  }
  write([...existing, slug]);
  return { inList: true, full: false };
}

export function removeCompareItem(slug: string) {
  write(readCompareList().filter((s) => s !== slug));
}

export function clearCompareList() {
  write([]);
}

/**
 * Drops slugs that no longer resolve to a real, comparable project (e.g.
 * unpublished/deleted since being added) — called once /compare's server
 * lookup comes back with fewer projects than requested slugs. Only writes
 * (and only fires the store-updated event, which is what keeps the Navbar
 * badge in sync) when the list actually shrinks, so a normal render never
 * triggers an extra write.
 */
export function pruneCompareList(validSlugs: string[]) {
  const current = readCompareList();
  const validSet = new Set(validSlugs);
  const next = current.filter((slug) => validSet.has(slug));
  if (next.length !== current.length) {
    write(next);
  }
}

/**
 * Starts at "[]" on every render up to and including mount (matching what
 * SSR necessarily renders, since there's no localStorage on the server) and
 * self-corrects to the real list in an effect right after mount — a plain
 * useState instead of useSyncExternalStore's getServerSnapshot trick, which
 * turned out to leave this exact list stuck on the server snapshot forever
 * on some routes (observed on /compare itself, behind its own loading.tsx
 * Suspense boundary) while working fine elsewhere (the Navbar badge, the
 * per-project toggle button) — the mismatch-correction render
 * useSyncExternalStore relies on apparently isn't guaranteed to fire when a
 * component's first commit comes from a Suspense-boundary reveal rather than
 * the root hydration pass. A plain post-mount effect has no such dependency:
 * it always runs once the component has committed, full stop.
 */
export function useCompareList(): string[] {
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    const initial = readCompareList();
    console.log("[mi-compare-debug] mount effect ran, readCompareList() =", initial);
    setList(initial);
    function onChange() {
      const next = readCompareList();
      console.log("[mi-compare-debug] onChange fired, readCompareList() =", next);
      setList(next);
    }
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  console.log("[mi-compare-debug] render, list =", list);

  return list;
}
