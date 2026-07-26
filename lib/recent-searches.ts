"use client";

import { useSyncExternalStore } from "react";

/** Single shared localStorage-backed recent-search list, used everywhere on the public site. */
const KEY = "mi:recent-searches";
const EVENT = "mi:recent-searches-updated";
const MAX = 6;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(term: string) {
  if (typeof window === "undefined") return;
  const trimmed = term.trim();
  if (!trimmed) return;
  try {
    const existing = readRecentSearches();
    const next = [trimmed, ...existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage unavailable (private browsing, quota) — search still proceeds
  }
}

export const RECENT_SEARCHES_EVENT = EVENT;

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

/**
 * Hydration-safe read of the recent-search list — `useSyncExternalStore`
 * (not `useState(() => readRecentSearches())`) so the very first client
 * render matches the server's, and every consumer re-renders automatically
 * whenever `saveRecentSearch` fires its update event, with no manual re-fetch.
 */
export function useRecentSearches(): string[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
