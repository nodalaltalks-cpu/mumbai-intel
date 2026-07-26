import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@/app/components/ui/icons";

function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

export default function Pagination({
  page,
  totalPages,
  total,
  buildHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const navClass = "flex items-center gap-1 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <p className="text-[11px] text-muted">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex items-center gap-1.5">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={prevDisabled}
          className={`${navClass} ${prevDisabled ? "pointer-events-none opacity-40" : "text-muted hover:border-accent hover:text-accent"}`}
        >
          <IconChevronLeft className="h-3 w-3" />
          Prev
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-[11px] text-muted">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={buildHref(p)}
                aria-current={p === page ? "page" : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-sm border text-[11px] font-mono transition-colors ${
                  p === page
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {p}
              </Link>
            )
          )}
        </div>

        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-disabled={nextDisabled}
          className={`${navClass} ${nextDisabled ? "pointer-events-none opacity-40" : "text-muted hover:border-accent hover:text-accent"}`}
        >
          Next
          <IconChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
