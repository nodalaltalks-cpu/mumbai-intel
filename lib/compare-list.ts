"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only, localStorage-backed Compare list — anonymous-friendly (no
 * sign-in required), same useSyncExternalStore pattern as
 * lib/recent-searches.ts. Stores project slugs, since that's already the
 * stable public identifier used by every project link on the site.
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

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(KEY) ?? "[]";
}

function getServerSnapshot() {
  return "[]";
}

export function useCompareList(): string[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
