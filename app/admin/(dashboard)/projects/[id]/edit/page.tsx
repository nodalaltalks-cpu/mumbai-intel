import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAmenities, getAuditHistory, getBrochureVersions, getBuildersForSelect, getInfraAssetsForCity, getLocalitiesForSelect, getProjectForEdit } from "@/lib/admin-queries";
import { requireSession } from "@/lib/auth/guard";
import { getProjectBrochureStats } from "@/lib/analytics/brochure-queries";
import BrochureStatsCard from "@/app/admin/components/BrochureStatsCard";
import AuditHistory from "@/app/admin/components/AuditHistory";
import BrochureUploader from "@/app/admin/components/BrochureUploader";
import FlashMessage from "@/app/admin/components/FlashMessage";
import ImageUploader from "@/app/admin/components/ImageUploader";
import CoverImageUploader from "@/app/admin/components/CoverImageUploader";
import ProjectForm from "@/app/admin/components/ProjectForm";
import ConfigurationsManager from "@/app/admin/components/ConfigurationsManager";
import SpecificationsManager from "@/app/admin/components/SpecificationsManager";
import NearbyPlacesManager from "@/app/admin/components/NearbyPlacesManager";
import ProjectSectionsManager from "@/app/admin/components/ProjectSectionsManager";
import ProjectTimelineManager from "@/app/admin/components/ProjectTimelineManager";
import ProjectFaqsManager from "@/app/admin/components/ProjectFaqsManager";
import InvestmentNotesManager from "@/app/admin/components/InvestmentNotesManager";
import DocumentsManager from "@/app/admin/components/DocumentsManager";

export const metadata: Metadata = { title: "Edit Project — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; brochureError?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();

  const [project, localities, builders, amenities, infraOptions, history, brochureVersions, brochureStats] = await Promise.all([
    getProjectForEdit(id),
    getLocalitiesForSelect(),
    getBuildersForSelect(),
    getAmenities(),
    getInfraAssetsForCity(),
    getAuditHistory("Project", id),
    getBrochureVersions(id),
    getProjectBrochureStats(id),
  ]);

  if (!project) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Edit Project</h1>
          <p className="text-xs text-muted">{project.name}</p>
        </div>
        <Link
          href={`/admin/projects/${project.id}/preview`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Preview
        </Link>
      </div>

      <FlashMessage type={query.created ? "created" : query.saved ? "saved" : null} warning={query.brochureError} />

      <div className="rounded-sm border border-border bg-surface p-4">
        <ProjectForm project={project} localities={localities} builders={builders} amenities={amenities} imageCount={project.images.length} />
      </div>

      <ConfigurationsManager projectId={project.id} configurations={project.configurations} />
      <SpecificationsManager projectId={project.id} specifications={project.specifications} />
      <NearbyPlacesManager projectId={project.id} links={project.infraLinks} infraOptions={infraOptions} />
      <ProjectSectionsManager projectId={project.id} sections={project.sections} />
      <ProjectTimelineManager projectId={project.id} events={project.timelineEvents} />
      <ProjectFaqsManager projectId={project.id} faqs={project.faqs} />
      <InvestmentNotesManager projectId={project.id} notes={project.investmentNotes} />

      <CoverImageUploader projectId={project.id} images={project.images} />

      <ImageUploader projectId={project.id} images={project.images} />

      <DocumentsManager projectId={project.id} documents={project.documents} />

      <BrochureUploader
        projectId={project.id}
        brochureUrl={project.brochureUrl}
        brochureFileName={project.brochureFileName}
        brochureFileSize={project.brochureFileSize}
        brochureUploadedAt={project.brochureUploadedAt}
        brochureThumbnailUrl={project.brochureThumbnailUrl}
        versions={brochureVersions}
        isAdmin={session.role === "ADMIN"}
        maxSizeMB={Math.round(Number(process.env.BROCHURE_MAX_SIZE_MB || 15))}
      />

      <BrochureStatsCard title="Brochure Downloads" stats={brochureStats} />

      <AuditHistory logs={history} />
    </div>
  );
}
