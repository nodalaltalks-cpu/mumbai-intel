import type { Metadata } from "next";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { formatPriceBand } from "@/lib/format";
import { STATUS_LABEL, CATEGORY_LABEL, type ProjectStatus, type PropertyCategory } from "@/lib/project-meta";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import ReviewQueueList, { type ReviewRecord } from "@/app/admin/components/ReviewQueueList";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = { title: "Review Queue — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

interface InfraStagingPayload {
  type: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceRef: string;
  detail?: string;
}

export default async function DataSyncReviewPage() {
  const records = await getPendingStagingRecords();

  const infraRecords = records.filter((r) => r.entityType === "InfraAsset");
  const projectRecords = records.filter((r) => r.entityType === "Project");

  const matchedInfraIds = infraRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedInfra = matchedInfraIds.length
    ? await prisma.infraAsset.findMany({ where: { id: { in: matchedInfraIds } }, select: { id: true, name: true, type: true, latitude: true, longitude: true } })
    : [];
  const matchedInfraById = new Map(matchedInfra.map((a) => [a.id, a]));

  const matchedProjectIds = projectRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedProjects = matchedProjectIds.length
    ? await prisma.project.findMany({ where: { id: { in: matchedProjectIds } }, select: { id: true, name: true, reraNumber: true, status: true } })
    : [];
  const matchedProjectById = new Map(matchedProjects.map((p) => [p.id, p]));

  const localityIds = [...new Set(projectRecords.map((r) => (r.payload as unknown as ProjectImportPayload).localityId))];
  const localities = localityIds.length ? await prisma.locality.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true } }) : [];
  const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

  const builderIds = [
    ...new Set(
      projectRecords
        .map((r) => (r.payload as unknown as ProjectImportPayload).builderId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const builders = builderIds.length ? await prisma.builder.findMany({ where: { id: { in: builderIds } }, select: { id: true, name: true } }) : [];
  const builderNameById = new Map(builders.map((b) => [b.id, b.name]));

  const reviewRecords: ReviewRecord[] = records.map((record) => {
    const isProject = record.entityType === "Project";
    const infraPayload = !isProject ? (record.payload as unknown as InfraStagingPayload) : null;
    const projectPayload = isProject ? (record.payload as unknown as ProjectImportPayload) : null;
    const matchedInfraAsset = infraPayload && record.matchedExistingId ? matchedInfraById.get(record.matchedExistingId) : null;
    const matchedProject = projectPayload && record.matchedExistingId ? matchedProjectById.get(record.matchedExistingId) : null;

    const proposedLines: string[] = [];
    let proposedTitle = "";
    if (projectPayload) {
      proposedTitle = projectPayload.name;
      const builderName = projectPayload.builderId ? builderNameById.get(projectPayload.builderId) ?? "Unknown builder" : null;
      proposedLines.push(
        [
          STATUS_LABEL[projectPayload.status as ProjectStatus],
          CATEGORY_LABEL[projectPayload.category as PropertyCategory],
          localityNameById.get(projectPayload.localityId) ?? "Unknown locality",
          ...(builderName ? [builderName] : []),
        ].join(" · ")
      );
      if (projectPayload.reraNumber) proposedLines.push(`RERA ${projectPayload.reraNumber}`);
      if (projectPayload.priceMinRupees || projectPayload.priceMaxRupees) {
        proposedLines.push(
          formatPriceBand(
            projectPayload.priceMinRupees ? projectPayload.priceMinRupees * 100 : null,
            projectPayload.priceMaxRupees ? projectPayload.priceMaxRupees * 100 : null
          )
        );
      }
    } else if (infraPayload) {
      proposedTitle = infraPayload.name;
      proposedLines.push(`${infraPayload.type} · ${infraPayload.latitude.toFixed(5)}, ${infraPayload.longitude.toFixed(5)}`);
      proposedLines.push(infraPayload.sourceRef);
    }

    let matchTitle: string | null = null;
    let matchLabel: string | null = null;
    const matchLines: string[] = [];
    if (matchedProject) {
      matchLabel = "Possible match (existing project)";
      matchTitle = matchedProject.name;
      matchLines.push(`${STATUS_LABEL[matchedProject.status]}${matchedProject.reraNumber ? ` · RERA ${matchedProject.reraNumber}` : ""}`);
      if (record.matchConfidence !== null) matchLines.push(`confidence ${Number(record.matchConfidence).toFixed(2)}`);
    } else if (matchedInfraAsset) {
      matchLabel = "Possible match (existing, manually curated)";
      matchTitle = matchedInfraAsset.name;
      matchLines.push(`${matchedInfraAsset.type} · ${matchedInfraAsset.latitude?.toFixed(5)}, ${matchedInfraAsset.longitude?.toFixed(5)}`);
      if (record.matchConfidence !== null) matchLines.push(`confidence ${Number(record.matchConfidence).toFixed(2)}`);
    }

    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      sourceKey: record.batch.sourceKey,
      proposedLabel: "Proposed",
      proposedTitle,
      proposedLines,
      matchLabel,
      matchTitle,
      matchLines,
      noMatchNote: isProject ? "Will be created as a new, unpublished project." : "Staged for review by source policy.",
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Review Queue</h1>
        <p className="text-xs text-muted">
          Candidates an import couldn&apos;t safely auto-apply — new or possibly-duplicate records awaiting a decision. Nothing here has touched the catalog yet.
        </p>
      </div>

      {reviewRecords.length === 0 ? (
        <EmptyState title="Nothing to review" message="All imported/synced records were either new or already matched exactly." />
      ) : (
        <ReviewQueueList records={reviewRecords} />
      )}
    </div>
  );
}
