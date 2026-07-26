"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconClose } from "./icons";

export interface ActiveFilterChip {
  /** Search param key(s) this chip clears. A chip can clear more than one param (e.g. priceMin + priceMax together). */
  keys: string[];
  label: string;
}

/** Removable filter chips + a single "Clear all" — shown under every filter bar once at least one filter is active. */
export default function ActiveFilters({ chips }: { chips: ActiveFilterChip[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (chips.length === 0) return null;

  function clearKeys(keys: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of keys) params.delete(key);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] uppercase tracking-wide text-muted">Active filters</span>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.keys.join("+")}
              type="button"
              onClick={() => clearKeys(chip.keys)}
              className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] text-accent transition-colors hover:border-accent hover:bg-accent/20"
            >
              {chip.label}
              <IconClose className="h-3 w-3 text-accent/70" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-negative"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
