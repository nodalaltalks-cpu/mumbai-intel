import { getFeaturedBuilders } from "@/lib/queries";
import BuilderCard from "./BuilderCard";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function FeaturedBuilders() {
  const builders = await getFeaturedBuilders(4);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Featured Developers" subtitle="Track record and delivery performance" viewAllHref="/builders" />

      {builders.length === 0 ? (
        <EmptyState title="No builders tracked yet" message="Builders added from the Admin Dashboard will appear here with their delivery track record." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {builders.map((builder) => (
            <BuilderCard key={builder.id} builder={builder} />
          ))}
        </div>
      )}
    </section>
  );
}
