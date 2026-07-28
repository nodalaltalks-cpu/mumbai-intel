import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getLocalitiesAdminPaged } from "@/lib/admin-queries";
import FlashMessage from "@/app/admin/components/FlashMessage";
import Pagination from "@/app/admin/components/Pagination";
import LocalityFilterBar from "@/app/admin/components/LocalityFilterBar";
import LocalitiesTable from "@/app/admin/components/LocalitiesTable";
import LocalityCardsGrid from "@/app/admin/components/LocalityCardsGrid";
import ViewToggle from "@/app/admin/components/ViewToggle";

export const metadata: Metadata = { title: "Locality Management — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLocalitiesPage({
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

  const { items: localities, total, totalPages } = await getLocalitiesAdminPaged({
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
    return qsString ? `/admin/localities?${qsString}` : "/admin/localities";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Locality Management</h1>
          <p className="text-xs text-muted">{total} total · Mumbai</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle />
          <Link
            href="/admin/localities/new"
            className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
          >
            New Locality
          </Link>
        </div>
      </div>

      <FlashMessage type={params.created ? "created" : params.saved ? "saved" : null} />

      <LocalityFilterBar />

      {view === "card" ? (
        <LocalityCardsGrid localities={localities} isAdmin={session.role === "ADMIN"} />
      ) : (
        <LocalitiesTable localities={localities} isAdmin={session.role === "ADMIN"} />
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
    </div>
  );
}
