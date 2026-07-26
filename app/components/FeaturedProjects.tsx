import ProjectCard from "./ProjectCard";
import { getFeaturedProjects } from "@/lib/queries";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function FeaturedProjects() {
  const projects = await getFeaturedProjects(6);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Featured Projects" subtitle="Curated listings across live Mumbai markets" viewAllHref="/projects" />

      {projects.length === 0 ? (
        <EmptyState title="No published projects yet" message="Projects added and published from the Admin Dashboard will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}
