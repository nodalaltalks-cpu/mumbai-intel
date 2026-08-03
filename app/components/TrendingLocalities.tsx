import LocalityCard from "./LocalityCard";
import { getPublicLocalitiesPaged } from "@/lib/queries";
import { getPublicSession } from "@/lib/public-auth/session";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function TrendingLocalities() {
  const [{ items: localities }, session] = await Promise.all([
    getPublicLocalitiesPaged({ sortBy: "projects_desc", pageSize: 4 }),
    getPublicSession(),
  ]);
  const locked = session === null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Trending Localities" subtitle="Most active neighbourhoods by live project count" viewAllHref="/localities" />

      {localities.length === 0 ? (
        <EmptyState title="No published localities yet" message="Localities added and published from the Admin Dashboard will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {localities.map((locality) => (
            <LocalityCard key={locality.id} locality={locality} locked={locked} />
          ))}
        </div>
      )}
    </section>
  );
}
