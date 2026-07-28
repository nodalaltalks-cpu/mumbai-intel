import { getNewestDevelopers } from "@/lib/queries";
import BuilderCard from "./BuilderCard";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function NewestDevelopers() {
  const builders = await getNewestDevelopers(4);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Newest Developers" subtitle="Most recently added to NoDalalTalks" viewAllHref="/builders?sort=updated_desc" />

      {builders.length === 0 ? (
        <EmptyState title="No developers added yet" message="Newly added developers will appear here." />
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
