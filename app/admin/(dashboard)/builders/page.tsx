import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getBuildersAdminPaged } from "@/lib/admin-queries";
import FlashMessage from "@/app/admin/components/FlashMessage";
import Pagination from "@/app/admin/components/Pagination";
import BuilderFilterBar from "@/app/admin/components/BuilderFilterBar";
import BuildersTable from "@/app/admin/components/BuildersTable";
import BuilderCardsGrid from "@/app/admin/components/BuilderCardsGrid";
import ViewToggle from "@/app/admin/components/ViewToggle";

export const metadata: Metadata = { title: "Builder Management — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function AdminBuildersPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    q?: string;
    published?: string;
    featured?: string;
    archived?: string;
    sort?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const view = params.view === "card" ? "card" : "table";

  const { items: builders, total, totalPages } = await getBuildersAdminPaged({
    q: params.q,
    isPublished: params.published === "1" ? true : params.published === "0" ? false : undefined,
    isFeatured: params.featured === "1" ? true : undefined,
    showArchived: params.archived === "1",
    sortBy: params.sort,
    page,
    pageSize: 20,
  });

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.published) qs.set("published", params.published);
    if (params.featured) qs.set("featured", params.featured);
    if (params.archived) qs.set("archived", params.archived);
    if (params.sort) qs.set("sort", params.sort);
    if (params.view) qs.set("view", params.view);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/admin/builders?${qsString}` : "/admin/builders";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Builder Management</h1>
          <p className="text-xs text-muted">{total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle />
          <Link
            href="/admin/builders/new"
            className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
          >
            New Builder
          </Link>
        </div>
      </div>

      <FlashMessage type={params.created ? "created" : params.saved ? "saved" : null} />

      <BuilderFilterBar />

      {view === "card" ? (
        <BuilderCardsGrid builders={builders} isAdmin={session.role === "ADMIN"} />
      ) : (
        <BuildersTable builders={builders} isAdmin={session.role === "ADMIN"} />
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
    </div>
  );
}
