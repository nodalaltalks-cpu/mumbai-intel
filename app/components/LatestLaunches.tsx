import ProjectCard from "./ProjectCard";
import { getLatestLaunches } from "@/lib/queries";
import { getPublicSession } from "@/lib/public-auth/session";
import { maskProjectBrochure } from "@/lib/premium/mask";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function LatestLaunches() {
  const [projects, session] = await Promise.all([getLatestLaunches(6), getPublicSession()]);
  const locked = session === null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Latest Launches" subtitle="New-launch and pre-launch projects, most recent first" viewAllHref="/projects?status=PRE_LAUNCH" />

      {projects.length === 0 ? (
        <EmptyState title="No new launches yet" message="Announced and pre-launch projects will appear here as they're published." />
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
