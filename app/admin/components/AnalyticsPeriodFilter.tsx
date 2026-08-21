"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ANALYTICS_PERIOD_OPTIONS, type AnalyticsPeriodKey } from "@/lib/analytics/period-constants";

const COOKIE_NAME = "mi_admin_analytics_period";

/**
 * The one reusable period picker for every admin analytics page (Section 37).
 * Writes `?period=` (+ `?from=&to=` for custom) on the CURRENT page via the
 * URL -- the server component re-reads it via resolveAnalyticsPeriod() -- and
 * also writes a plain (non-sensitive, UI-preference-only) cookie so that
 * navigating to a *different* analytics page without an explicit ?period= in
 * its link defaults to the same choice instead of resetting to "Month"
 * (Section 39). Every other query param on the current page is preserved.
 */
export default function AnalyticsPeriodFilter({ current, currentFrom, currentTo }: { current: AnalyticsPeriodKey; currentFrom?: string; currentTo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(current === "custom");
  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");

  function applyPeriod(key: AnalyticsPeriodKey, fromDate?: string, toDate?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    if (key === "custom" && fromDate && toDate) {
      params.set("from", fromDate);
      params.set("to", toDate);
      document.cookie = `${COOKIE_NAME}=custom:${fromDate}:${toDate}; path=/admin; max-age=${60 * 60 * 24 * 90}`;
    } else {
      params.delete("from");
      params.delete("to");
      document.cookie = `${COOKIE_NAME}=${key}; path=/admin; max-age=${60 * 60 * 24 * 90}`;
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSelect(key: AnalyticsPeriodKey) {
    if (key === "custom") {
      setCustomOpen(true);
      if (from && to) applyPeriod("custom", from, to);
      return;
    }
    setCustomOpen(false);
    applyPeriod(key);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-sm border border-border bg-surface p-1">
        {ANALYTICS_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleSelect(option.key)}
            className={`rounded-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide transition-colors ${
              current === option.key ? "bg-accent text-white" : "text-muted hover:bg-accent/10 hover:text-accent"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {customOpen ? (
        <div className="flex items-center gap-1.5 rounded-sm border border-border bg-surface p-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-sm border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
          />
          <span className="text-[10px] text-muted">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-sm border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
          />
          <button
            type="button"
            disabled={!from || !to}
            onClick={() => applyPeriod("custom", from, to)}
            className="rounded-sm bg-accent px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-white hover:bg-accent-dim disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
