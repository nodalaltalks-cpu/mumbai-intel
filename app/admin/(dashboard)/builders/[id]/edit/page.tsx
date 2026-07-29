import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAmenities, getAuditHistory, getBuilderForEdit } from "@/lib/admin-queries";
import BuilderForm from "@/app/admin/components/BuilderForm";
import BuilderScoreManager from "@/app/admin/components/BuilderScoreManager";
import BuilderTimelineManager from "@/app/admin/components/BuilderTimelineManager";
import BuilderGalleryUploader from "@/app/admin/components/BuilderGalleryUploader";
import AuditHistory from "@/app/admin/components/AuditHistory";
import BrochureStatsCard from "@/app/admin/components/BrochureStatsCard";
import { getBuilderBrochureStats } from "@/lib/analytics/brochure-queries";

export const metadata: Metadata = { title: "Edit Builder — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function EditBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [builder, amenities, history, brochureStats] = await Promise.all([
    getBuilderForEdit(id),
    getAmenities(),
    getAuditHistory("Builder", id),
    getBuilderBrochureStats(id),
  ]);
  if (!builder) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Edit Builder</h1>
          <p className="text-xs text-muted">{builder.name}</p>
        </div>
        <Link
          href={`/admin/builders/${builder.id}/preview`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Preview
        </Link>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <BuilderForm
          builder={{
            id: builder.id,
            slug: builder.slug,
            name: builder.name,
            legalNames: builder.legalNames,
            logoUrl: builder.logoUrl,
            coverImageUrl: builder.coverImageUrl,
            description: builder.description,
            foundedYear: builder.foundedYear,
            headquarters: builder.headquarters,
            websiteUrl: builder.websiteUrl,
            reraNumber: builder.reraNumber,
            awards: builder.awards,
            dataSource: builder.dataSource,
            confidence: builder.confidence,
            isPublished: builder.isPublished,
            isFeatured: builder.isFeatured,
            metaTitle: builder.metaTitle,
            metaDescription: builder.metaDescription,
            ogImageUrl: builder.ogImageUrl,
            amenityIds: builder.amenityIds,
          }}
          amenities={amenities}
        />
      </div>

      <BuilderTimelineManager builderId={builder.id} events={builder.timeline} />

      <BuilderScoreManager
        builderId={builder.id}
        snapshots={builder.scoreSnapshots.map((s) => ({
          id: s.id,
          asOf: s.asOf,
          overallScore: s.overallScore.toString(),
          onTimeDeliveryPct: s.onTimeDeliveryPct?.toString() ?? null,
          deliveredProjects: s.deliveredProjects,
          activeProjects: s.activeProjects,
          litigationFlags: s.litigationFlags,
          methodologyVersion: s.methodologyVersion,
        }))}
      />

      <BuilderGalleryUploader builderId={builder.id} images={builder.images} />

      <BrochureStatsCard title="Brochure Downloads (all projects)" stats={brochureStats} />

      <AuditHistory logs={history} />
    </div>
  );
}
