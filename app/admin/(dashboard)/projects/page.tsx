import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getProjectsAdminPaged } from "@/lib/admin-queries";
import FlashMessage from "@/app/admin/components/FlashMessage";
import Pagination from "@/app/admin/components/Pagination";
import ProjectFilterBar from "@/app/admin/components/ProjectFilterBar";
import ProjectsTable from "@/app/admin/components/ProjectsTable";
import ProjectCardsGrid from "@/app/admin/components/ProjectCardsGrid";
import ViewToggle from "@/app/admin/components/ViewToggle";
import SavedFilters from "@/app/admin/components/SavedFilters";

export const metadata: Metadata = { title: "Project Management — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    q?: string;
    status?: string;
    category?: string;
    published?: string;
    featured?: string;
    archived?: string;
    bedrooms?: string;
    priceMin?: string;
    priceMax?: string;
    possession?: string;
    rera?: string;
    sort?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const view = params.view === "card" ? "card" : "table";

  const { items: projects, total, totalPages } = await getProjectsAdminPaged({
    q: params.q,
    status: params.status,
    category: params.category,
    isPublished: params.published === "1" ? true : params.published === "0" ? false : undefined,
    isFeatured: params.featured === "1" ? true : undefined,
    showArchived: params.archived === "1",
    bedrooms: params.bedrooms,
    priceMinRupees: params.priceMin ? Number(params.priceMin) : undefined,
    priceMaxRupees: params.priceMax ? Number(params.priceMax) : undefined,
    possession: params.possession,
    hasRera: params.rera === "1" ? true : params.rera === "0" ? false : undefined,
    sortBy: params.sort,
    page,
    pageSize: 20,
  });

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.category) qs.set("category", params.category);
    if (params.published) qs.set("published", params.published);
    if (params.featured) qs.set("featured", params.featured);
    if (params.archived) qs.set("archived", params.archived);
    if (params.bedrooms) qs.set("bedrooms", params.bedrooms);
    if (params.priceMin) qs.set("priceMin", params.priceMin);
    if (params.priceMax) qs.set("priceMax", params.priceMax);
    if (params.possession) qs.set("possession", params.possession);
    if (params.rera) qs.set("rera", params.rera);
    if (params.sort) qs.set("sort", params.sort);
    if (params.view) qs.set("view", params.view);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/admin/projects?${qsString}` : "/admin/projects";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Project Management</h1>
          <p className="text-xs text-muted">{total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle />
          <Link
            href="/admin/projects/new"
            className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
          >
            New Project
          </Link>
        </div>
      </div>

      <FlashMessage type={params.created ? "created" : params.saved ? "saved" : null} />

      <ProjectFilterBar />
      <SavedFilters />

      {view === "card" ? (
        <ProjectCardsGrid projects={projects} isAdmin={session.role === "ADMIN"} />
      ) : (
        <ProjectsTable projects={projects} isAdmin={session.role === "ADMIN"} />
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
    </div>
  );
}
