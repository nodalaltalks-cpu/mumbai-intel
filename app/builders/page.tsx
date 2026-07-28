import type { Metadata } from "next";
import { getCitiesForSelect, getPublicBuildersPaged } from "@/lib/queries";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import BuilderCard from "@/app/components/BuilderCard";
import BuilderFilters from "@/app/components/BuilderFilters";
import Pagination from "@/app/admin/components/Pagination";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Developers — NoDalalTalks",
  description: "Browse Mumbai real estate developers with track record, portfolio and trust-score data.",
  alternates: { canonical: "/builders" },
};
export const dynamic = "force-dynamic";

interface BuilderSearchParams {
  q?: string;
  city?: string;
  minActive?: string;
  minDelivered?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  page?: string;
}

export default async function BuildersPage({ searchParams }: { searchParams: Promise<BuilderSearchParams> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [{ items: builders, total, totalPages }, cities] = await Promise.all([
    getPublicBuildersPaged({
      q: params.q,
      cityId: params.city,
      minActiveProjects: params.minActive ? Number(params.minActive) : undefined,
      minDeliveredProjects: params.minDelivered ? Number(params.minDelivered) : undefined,
      priceMinRupees: params.priceMin ? Number(params.priceMin) : undefined,
      priceMaxRupees: params.priceMax ? Number(params.priceMax) : undefined,
      sortBy: params.sort,
      page,
      pageSize: 12,
    }),
    getCitiesForSelect(),
  ]);

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page") continue;
      if (value) qs.set(key, value);
    }
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/builders?${qsString}` : "/builders";
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <BuilderFilters cities={cities} />

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-mono text-lg font-semibold text-foreground">
          {total} developer{total === 1 ? "" : "s"}
        </h1>

        {builders.length === 0 ? (
          <EmptyState title="No developers match these filters" message="Try widening your search or resetting filters." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {builders.map((builder) => (
              <BuilderCard key={builder.id} builder={builder} />
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
