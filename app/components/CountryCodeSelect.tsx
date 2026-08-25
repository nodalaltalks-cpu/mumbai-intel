"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_CALLING_CODES, flagEmoji, type CountryCallingCode } from "@/lib/country-codes";

/**
 * Searchable country calling-code selector (Part 1 of the profile UX fixes)
 * — defaults to India, shows flag + name + dial code, filters by either
 * country name or the dial code itself. A plain <select> can't show a flag
 * + two-line label per option reliably across browsers, so this is a
 * button + positioned listbox instead — same interaction pattern as any
 * modern combobox, built with plain state (no new dependency).
 */
export default function CountryCodeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (dialCode: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => COUNTRY_CALLING_CODES.find((c) => c.dialCode === value) ?? COUNTRY_CALLING_CODES[0],
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CALLING_CODES;
    const qDigits = q.replace(/[^\d]/g, "");
    return COUNTRY_CALLING_CODES.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (qDigits && c.dialCode.replace("+", "").startsWith(qDigits)) return true;
      return false;
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    // Autofocus the search box the moment the list opens, so typing works immediately.
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.clearTimeout(t);
    };
  }, [open]);

  function selectCountry(country: CountryCallingCode) {
    onChange(country.dialCode);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2.5 text-sm text-foreground transition-shadow hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-50"
      >
        <span aria-hidden="true">{flagEmoji(selected.iso2)}</span>
        <span className="font-mono">{selected.dialCode}</span>
        <span aria-hidden="true" className="text-muted">▾</span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 flex max-h-80 w-72 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted">No matching country.</p>
            ) : (
              filtered.map((country) => (
                <button
                  key={country.iso2}
                  type="button"
                  role="option"
                  aria-selected={country.dialCode === selected.dialCode}
                  onClick={() => selectCountry(country)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised ${
                    country.dialCode === selected.dialCode ? "bg-accent/10 text-accent" : "text-foreground"
                  }`}
                >
                  <span aria-hidden="true" className="shrink-0">{flagEmoji(country.iso2)}</span>
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  <span className="shrink-0 font-mono text-muted">{country.dialCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
