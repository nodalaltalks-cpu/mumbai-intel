import { getTopDevelopers } from "@/lib/queries";
import { getPublicSession } from "@/lib/public-auth/session";
import BuilderCard from "./BuilderCard";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function TopDevelopers() {
  const [builders, session] = await Promise.all([getTopDevelopers(4), getPublicSession()]);
  const locked = session === null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Top Developers" subtitle="Ranked by trust score across Mumbai" viewAllHref="/builders?sort=projects_desc" />

      {builders.length === 0 ? (
        <EmptyState title="No rated developers yet" message="Developers with a published trust score will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {builders.map((builder) => (
            <BuilderCard key={builder.id} builder={builder} locked={locked} />
          ))}
        </div>
      )}
    </section>
  );
}
