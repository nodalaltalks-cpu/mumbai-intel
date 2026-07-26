"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function PublicSearchBar({
  placeholder,
  basePath,
  sortOptions,
}: {
  placeholder: string;
  basePath: string;
  sortOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) updateParam("q", q);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-6xl rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
        />
        <select
          value={searchParams.get("sort") ?? "updated_desc"}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="w-full max-w-[14rem] rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-accent focus:outline-none"
        >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {searchParams.toString() ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="h-fit rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition hover:border-negative hover:text-negative"
        >
          Clear
        </button>
      ) : null}
      </div>
    </div>
  );
}
