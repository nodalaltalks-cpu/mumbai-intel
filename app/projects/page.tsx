import type { Metadata } from "next";
import { getPublicProjectsPaged } from "@/lib/queries";
import { getBuildersForSelect, getLocalitiesForSelect } from "@/lib/admin-queries";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import ProjectFilters from "@/app/components/ProjectFilters";
import ProjectCard from "@/app/components/ProjectCard";
import Pagination from "@/app/admin/components/Pagination";
import EmptyState from "@/app/components/ui/EmptyState";
import { recordResearchEvent } from "@/lib/analytics/research-events";

export const metadata: Metadata = {
  title: "Projects — NoDalalTalks",
  description: "Browse residential and commercial real estate projects across Mumbai with source-tagged pricing, status and configuration data.",
  alternates: { canonical: "/projects" },
};
export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    locality?: string;
    builder?: string;
    status?: string;
    category?: string;
    bedrooms?: string;
    priceMin?: string;
    priceMax?: string;
    possession?: string;
    rera?: string;
    luxury?: string;
    affordable?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [{ items: projects, total, totalPages }, localities, builders] = await Promise.all([
    getPublicProjectsPaged({
      q: params.q,
      localityId: params.locality,
      builderId: params.builder,
      status: params.status,
      category: params.category,
      bedrooms: params.bedrooms,
      priceMinRupees: params.priceMin ? Number(params.priceMin) : undefined,
      priceMaxRupees: params.priceMax ? Number(params.priceMax) : undefined,
      possession: params.possession,
      hasRera: params.rera === "1" ? true : params.rera === "0" ? false : undefined,
      isLuxury: params.luxury === "1",
      isAffordable: params.affordable === "1",
      sortBy: params.sort,
      page,
      pageSize: 12,
    }),
    getLocalitiesForSelect(),
    getBuildersForSelect(),
  ]);

  if (params.q) {
    await recordResearchEvent("SEARCH_PERFORMED", { metadata: { query: params.q } });
  }
  const activeFilterKeys = (["locality", "builder", "status", "category", "bedrooms", "priceMin", "priceMax", "possession", "rera", "luxury", "affordable"] as const).filter(
    (key) => Boolean(params[key])
  );
  if (activeFilterKeys.length > 0) {
    await recordResearchEvent("FILTERS_USED", { metadata: { filters: activeFilterKeys } });
  }

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page") continue;
      if (value) qs.set(key, value);
    }
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/projects?${qsString}` : "/projects";
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <ProjectFilters localities={localities} builders={builders} />

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-mono text-lg font-semibold text-foreground">
            {total} project{total === 1 ? "" : "s"}
          </h1>
        </div>

        {projects.length === 0 ? (
          <EmptyState title="No projects match these filters" message="Try widening your search or resetting filters." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}

        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
