import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getFounderExceptions, type FounderExceptionFilter } from "@/lib/enrichment/founderExceptions";
import FounderExceptionsList from "@/app/admin/components/FounderExceptionsList";
import Pagination from "@/app/admin/components/Pagination";

export const metadata: Metadata = { title: "Founder Exceptions — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const FILTERS: FounderExceptionFilter[] = ["open", "resolved", "all"];

export default async function FounderExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const filter: FounderExceptionFilter = FILTERS.includes(params.filter as FounderExceptionFilter) ? (params.filter as FounderExceptionFilter) : "open";
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const { items, total, totalPages, openCount, openProjectCount } = await getFounderExceptions({ filter, page, pageSize: 25 });

  function buildHref(targetFilter: FounderExceptionFilter, targetPage: number) {
    const qs = new URLSearchParams();
    if (targetFilter !== "open") qs.set("filter", targetFilter);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/admin/data-sync/founder-exceptions?${qsString}` : "/admin/data-sync/founder-exceptions";
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Founder Exceptions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fields where reasonable automated attempts were exhausted and only you can supply or verify the value. Everything else keeps processing on its own — this is the only list that needs your attention.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          {openProjectCount} project{openProjectCount === 1 ? "" : "s"} · {openCount} open field{openCount === 1 ? "" : "s"}
        </p>
        <p className="mt-2 text-xs text-muted">
          Looking for what the research agent found and changed, not what still needs you?{" "}
          <a href="/admin/data-sync/research-activity" className="text-accent hover:underline">
            View Research Activity
          </a>{" "}
          — a genuinely accepted or already-resolved research finding is never listed here as an exception.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <a
            key={f}
            href={buildHref(f, 1)}
            className={`rounded-sm border px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
              f === filter ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {f}
          </a>
        ))}
      </div>

      <FounderExceptionsList items={items} />

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={(p) => buildHref(filter, p)} />
    </div>
  );
}
