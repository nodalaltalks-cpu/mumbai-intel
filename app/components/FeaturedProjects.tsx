import ProjectCard from "./ProjectCard";
import { getFeaturedProjects } from "@/lib/queries";
import { getPublicSession } from "@/lib/public-auth/session";
import { maskProjectBrochure } from "@/lib/premium/mask";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function FeaturedProjects() {
  const [projects, session] = await Promise.all([getFeaturedProjects(6), getPublicSession()]);
  const locked = session === null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Featured Projects" subtitle="Curated listings across live Mumbai markets" viewAllHref="/projects" />

      {projects.length === 0 ? (
        <EmptyState title="No published projects yet" message="Projects added and published from the Admin Dashboard will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={maskProjectBrochure(project, locked)} />
          ))}
        </div>
      )}
    </section>
  );
}
