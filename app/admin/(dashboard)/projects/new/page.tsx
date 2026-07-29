import type { Metadata } from "next";
import { getAmenities, getBuildersForSelect, getLocalitiesForSelect } from "@/lib/admin-queries";
import ProjectForm from "@/app/admin/components/ProjectForm";
import BackButton from "@/app/admin/components/BackButton";

export const metadata: Metadata = { title: "New Project — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [localities, builders, amenities] = await Promise.all([
    getLocalitiesForSelect(),
    getBuildersForSelect(),
    getAmenities(),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackButton fallbackHref="/admin/projects" />
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">New Project</h1>
        <p className="text-xs text-muted">
          Configurations, specifications, images, documents and everything else below become available after the
          project is created.
        </p>
      </div>
      <div className="rounded-sm border border-border bg-surface p-4">
        <ProjectForm localities={localities} builders={builders} amenities={amenities} />
      </div>
    </div>
  );
}
