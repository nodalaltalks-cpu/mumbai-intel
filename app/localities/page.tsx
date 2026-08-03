import type { Metadata } from "next";
import { getPublicLocalitiesPaged } from "@/lib/queries";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import LocalityCard from "@/app/components/LocalityCard";
import Pagination from "@/app/admin/components/Pagination";
import PublicSearchBar from "@/app/components/PublicSearchBar";
import EmptyState from "@/app/components/ui/EmptyState";
import { getPublicSession } from "@/lib/public-auth/session";

export const metadata: Metadata = {
  title: "Localities — NoDalalTalks",
  description: "Explore Mumbai localities with market snapshots, price trends and investment scores.",
  alternates: { canonical: "/localities" },
};
export const dynamic = "force-dynamic";

const LOCALITY_SORT_OPTIONS = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "projects_desc", label: "Most projects" },
  { value: "price_desc", label: "Price: High to Low" },
];

export default async function LocalitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [{ items: localities, total, totalPages }, session] = await Promise.all([
    getPublicLocalitiesPaged({
      q: params.q,
      sortBy: params.sort,
      page,
      pageSize: 12,
    }),
    getPublicSession(),
  ]);
  const locked = session === null;

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.sort) qs.set("sort", params.sort);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/localities?${qsString}` : "/localities";
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <div className="sticky top-[57px] z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <PublicSearchBar placeholder="Search localities…" basePath="/localities" sortOptions={LOCALITY_SORT_OPTIONS} />
      </div>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-mono text-lg font-semibold text-foreground">
          {total} localit{total === 1 ? "y" : "ies"}
        </h1>

        {localities.length === 0 ? (
          <EmptyState title="No localities match these filters" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {localities.map((locality) => (
              <LocalityCard key={locality.id} locality={locality} locked={locked} />
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
