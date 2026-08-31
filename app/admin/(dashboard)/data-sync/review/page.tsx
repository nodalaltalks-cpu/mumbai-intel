import type { Metadata } from "next";
import { getPendingStagingRecords } from "@/lib/admin-queries";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPaise, formatPriceBand } from "@/lib/format";
import { STATUS_LABEL, CATEGORY_LABEL, TRANSACTION_TYPE_LABEL, type ProjectStatus, type PropertyCategory, type TransactionType } from "@/lib/project-meta";
import type { BuilderImportPayload, LocalityImportPayload, ProjectImportPayload, TransactionImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import {
  buildBuilderReviewCompleteness,
  buildInfraReviewCompleteness,
  buildLocalityReviewCompleteness,
  buildProjectReviewCompleteness,
  buildTransactionReviewCompleteness,
} from "@/lib/ingestion/reviewFieldRegistry";
import { computeApprovalReadiness } from "@/lib/ingestion/projectApprovalReadiness";
import { deriveEnrichmentBadge } from "@/lib/enrichment/enrichmentSummary";
import ReviewQueueList, { type ReviewRecord } from "@/app/admin/components/ReviewQueueList";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = { title: "Review Queue — NoDalalTalks Admin" };
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
  const builderRecords = records.filter((r) => r.entityType === "Builder");
  const localityRecords = records.filter((r) => r.entityType === "Locality");
  const transactionRecords = records.filter((r) => r.entityType === "Transaction");

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

  const matchedBuilderIds = builderRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedBuilders = matchedBuilderIds.length
    ? await prisma.builder.findMany({ where: { id: { in: matchedBuilderIds } }, select: { id: true, name: true, headquarters: true } })
    : [];
  const matchedBuilderById = new Map(matchedBuilders.map((b) => [b.id, b]));

  const matchedLocalityIds = localityRecords.map((r) => r.matchedExistingId).filter((id): id is string => Boolean(id));
  const matchedLocalities = matchedLocalityIds.length
    ? await prisma.locality.findMany({ where: { id: { in: matchedLocalityIds } }, select: { id: true, name: true, pincode: true } })
    : [];
  const matchedLocalityById = new Map(matchedLocalities.map((l) => [l.id, l]));

  const localityIds = [
    ...new Set([
      ...projectRecords.map((r) => (r.payload as unknown as ProjectImportPayload).localityId),
      ...transactionRecords.map((r) => (r.payload as unknown as TransactionImportPayload).localityId),
    ]),
  ];
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

  const transactionProjectIds = [
    ...new Set(transactionRecords.map((r) => (r.payload as unknown as TransactionImportPayload).projectId).filter((id): id is string => Boolean(id))),
  ];
  const transactionProjects = transactionProjectIds.length
    ? await prisma.project.findMany({ where: { id: { in: transactionProjectIds } }, select: { id: true, name: true } })
    : [];
  const transactionProjectNameById = new Map(transactionProjects.map((p) => [p.id, p.name]));

  const reviewRecords: ReviewRecord[] = records.map((record) => {
    const isProject = record.entityType === "Project";
    const isBuilder = record.entityType === "Builder";
    const isLocality = record.entityType === "Locality";
    const isTransaction = record.entityType === "Transaction";
    const infraPayload = record.entityType === "InfraAsset" ? (record.payload as unknown as InfraStagingPayload) : null;
    const projectPayload = isProject ? (record.payload as unknown as ProjectImportPayload) : null;
    const builderPayload = isBuilder ? (record.payload as unknown as BuilderImportPayload) : null;
    const localityPayload = isLocality ? (record.payload as unknown as LocalityImportPayload) : null;
    const transactionPayload = isTransaction ? (record.payload as unknown as TransactionImportPayload) : null;

    const matchedInfraAsset = infraPayload && record.matchedExistingId ? matchedInfraById.get(record.matchedExistingId) : null;
    const matchedProjectForCompleteness = projectPayload && record.matchedExistingId ? matchedProjectById.get(record.matchedExistingId) ?? null : null;
    const matchedProject = projectPayload && record.matchedExistingId ? matchedProjectById.get(record.matchedExistingId) : null;
    const matchedBuilder = builderPayload && record.matchedExistingId ? matchedBuilderById.get(record.matchedExistingId) : null;
    const matchedLocality = localityPayload && record.matchedExistingId ? matchedLocalityById.get(record.matchedExistingId) : null;

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
    } else if (builderPayload) {
      proposedTitle = builderPayload.name;
      proposedLines.push([builderPayload.headquarters, builderPayload.foundedYear ? `est. ${builderPayload.foundedYear}` : null].filter(Boolean).join(" · "));
      if (builderPayload.reraNumber) proposedLines.push(`RERA ${builderPayload.reraNumber}`);
    } else if (localityPayload) {
      proposedTitle = localityPayload.name;
      proposedLines.push([localityPayload.pincode, localityPayload.avgPriceRupeesPerSqft ? `₹${localityPayload.avgPriceRupeesPerSqft}/sqft` : null].filter(Boolean).join(" · "));
    } else if (transactionPayload) {
      proposedTitle = `${TRANSACTION_TYPE_LABEL[transactionPayload.type as TransactionType]} · ${formatPaise(BigInt(Math.round(transactionPayload.valueRupees * 100)))}`;
      proposedLines.push(
        [
          localityNameById.get(transactionPayload.localityId) ?? "Unknown locality",
          transactionPayload.projectId ? transactionProjectNameById.get(transactionPayload.projectId) ?? "Unknown project" : null,
          formatDate(new Date(transactionPayload.registrationDateIso)),
        ]
          .filter(Boolean)
          .join(" · ")
      );
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
    } else if (matchedBuilder) {
      matchLabel = "Possible match (existing builder)";
      matchTitle = matchedBuilder.name;
      if (matchedBuilder.headquarters) matchLines.push(matchedBuilder.headquarters);
      if (record.matchConfidence !== null) matchLines.push(`confidence ${Number(record.matchConfidence).toFixed(2)}`);
    } else if (matchedLocality) {
      matchLabel = "Possible match (existing locality)";
      matchTitle = matchedLocality.name;
      if (matchedLocality.pincode) matchLines.push(matchedLocality.pincode);
      if (record.matchConfidence !== null) matchLines.push(`confidence ${Number(record.matchConfidence).toFixed(2)}`);
    }

    const noMatchNote = isProject
      ? "Will be created as a new, unpublished project."
      : isBuilder
        ? "Will be created as a new, unpublished builder."
        : isLocality
          ? "Will be created as a new, unpublished locality."
          : isTransaction
            ? "Will be created as a new transaction record."
            : "Staged for review by source policy.";

    // Phase 14C: full field-completeness breakdown, dispatched purely on
    // entityType (the same branching this page already does above) -- never
    // on sourceKey/source, so a new portal added to the ingestion pipeline
    // tomorrow needs no change here.
    const completeness = projectPayload
      ? buildProjectReviewCompleteness(projectPayload, {
          localityName: localityNameById.get(projectPayload.localityId),
          builderName: projectPayload.builderId ? builderNameById.get(projectPayload.builderId) : undefined,
          matched: matchedProjectForCompleteness
            ? { name: matchedProjectForCompleteness.name, status: matchedProjectForCompleteness.status, reraNumber: matchedProjectForCompleteness.reraNumber }
            : null,
        })
      : builderPayload
        ? buildBuilderReviewCompleteness(builderPayload)
        : localityPayload
          ? buildLocalityReviewCompleteness(localityPayload)
          : transactionPayload
            ? buildTransactionReviewCompleteness(transactionPayload, {
                localityName: localityNameById.get(transactionPayload.localityId),
                projectName: transactionPayload.projectId ? transactionProjectNameById.get(transactionPayload.projectId) : undefined,
              })
            : infraPayload
              ? buildInfraReviewCompleteness(infraPayload)
              : null;

    // Phase 34 Part F: readiness is a Project-only concept, derived from the
    // SAME completeness object above -- never a second calculation, never
    // computed for Builder/Locality/Transaction/InfraAsset records.
    const readiness = isProject && completeness ? computeApprovalReadiness(completeness) : null;

    // Phase 46 Part E/N: reads the LAST persisted enrichment run's summary
    // straight off this same payload -- pure, synchronous, no live fetch.
    // Never computed for a non-Project record.
    const enrichmentBadge = isProject ? deriveEnrichmentBadge(record.payload) : null;

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
      noMatchNote,
      completeness,
      isProject,
      readiness,
      enrichmentBadge,
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
