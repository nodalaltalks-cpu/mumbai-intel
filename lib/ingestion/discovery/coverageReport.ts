import "server-only";
import { prisma } from "@/lib/prisma";
import { DISCOVERY_ENTITY_TYPE, type ProjectDiscoveryCandidatePayload } from "./types";
import type { ExistingLocalityWithAliases } from "./areaLocalityResolution";
import { resolveStoredAreaNameToLocality } from "./generic/areaEvidenceSearch";
import { resolveDeveloperDomain, listCuratedDeveloperDomains } from "@/lib/enrichment/developerDomainRegistry";

/**
 * Phase 63 §13 — a practical, read-derived Discovery Coverage report. Reuses
 * the EXISTING `ProjectDiscoveryCandidate` rows (IngestStagingRecord with
 * entityType=DISCOVERY_ENTITY_TYPE) and the existing curated developer
 * registry / area-locality resolver — no new table, no new aggregation
 * pipeline running on a schedule, just a query over what already exists.
 * Deliberately NOT a general analytics dashboard: two small tables
 * (developer, locality) plus two "needs more coverage" lists.
 */

export interface DeveloperCoverageRow {
  /** The curated domain's canonical display name (first alias), or the raw discovered name if this developer isn't curated yet. */
  developerName: string;
  domain: string | null;
  isCurated: boolean;
  totalCandidates: number;
  staged: number;
  needsReview: number;
  excluded: number;
  rejectedDuplicate: number;
  /** DISCOVERED | SOURCE_FOUND | READY_FOR_ENRICHMENT — not yet resolved to a final bucket. */
  inProgress: number;
}

export interface LocalityCoverageRow {
  localityName: string;
  candidateCount: number;
}

export interface DiscoveryCoverageReport {
  developers: DeveloperCoverageRow[];
  localities: LocalityCoverageRow[];
  /** Curated developers (by domain) with zero discovery candidates ever recorded. */
  lowCoverageDevelopers: string[];
  /** Seeded Mumbai localities with zero candidates ever resolved to them. */
  lowCoverageLocalities: string[];
  totalCandidates: number;
  totalCuratedDevelopers: number;
  totalMumbaiLocalities: number;
  /** Candidates whose developerName/areaName couldn't be attributed to a curated developer / resolved locality — never silently dropped from the totals. */
  unresolvedDeveloperCandidates: number;
  unresolvedLocalityCandidates: number;
}

function normalizeDeveloperName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getDiscoveryCoverageReport(): Promise<DiscoveryCoverageReport> {
  const [candidateRows, localityRows] = await Promise.all([
    prisma.ingestStagingRecord.findMany({ where: { entityType: DISCOVERY_ENTITY_TYPE }, select: { status: true, payload: true } }),
    prisma.locality.findMany({ where: { city: { slug: "mumbai" } }, select: { id: true, name: true, aliases: { select: { alias: true } } } }),
  ]);

  const localities: ExistingLocalityWithAliases[] = localityRows.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) }));
  const curatedDomains = listCuratedDeveloperDomains();

  const developerByDomain = new Map<string, DeveloperCoverageRow>();
  for (const { domain, names } of curatedDomains) {
    developerByDomain.set(domain, {
      developerName: names[0],
      domain,
      isCurated: true,
      totalCandidates: 0,
      staged: 0,
      needsReview: 0,
      excluded: 0,
      rejectedDuplicate: 0,
      inProgress: 0,
    });
  }
  const uncuratedDeveloperByName = new Map<string, DeveloperCoverageRow>();
  const localityCandidateCount = new Map<string, number>(localities.map((l) => [l.name, 0]));

  let unresolvedDeveloperCandidates = 0;
  let unresolvedLocalityCandidates = 0;

  for (const row of candidateRows) {
    const payload = row.payload as unknown as ProjectDiscoveryCandidatePayload;

    const domain = resolveDeveloperDomain(payload.developerName);
    let devRow: DeveloperCoverageRow;
    if (domain && developerByDomain.has(domain)) {
      devRow = developerByDomain.get(domain)!;
    } else {
      unresolvedDeveloperCandidates += 1;
      const key = normalizeDeveloperName(payload.developerName || "(unknown)");
      devRow = uncuratedDeveloperByName.get(key) ?? {
        developerName: payload.developerName || "(unknown)",
        domain: null,
        isCurated: false,
        totalCandidates: 0,
        staged: 0,
        needsReview: 0,
        excluded: 0,
        rejectedDuplicate: 0,
        inProgress: 0,
      };
      uncuratedDeveloperByName.set(key, devRow);
    }

    devRow.totalCandidates += 1;
    if (row.status === "PROJECT_STAGED") devRow.staged += 1;
    else if (row.status === "NEEDS_REVIEW") devRow.needsReview += 1;
    else if (row.status === "EXCLUDED") devRow.excluded += 1;
    else if (row.status === "REJECTED_DUPLICATE") devRow.rejectedDuplicate += 1;
    else devRow.inProgress += 1;

    const localityMatch = resolveStoredAreaNameToLocality(payload.areaName ?? "", localities);
    if (localityMatch.status === "SINGLE_MATCH" && localityMatch.localityName) {
      localityCandidateCount.set(localityMatch.localityName, (localityCandidateCount.get(localityMatch.localityName) ?? 0) + 1);
    } else {
      unresolvedLocalityCandidates += 1;
    }
  }

  const developers = [...developerByDomain.values(), ...uncuratedDeveloperByName.values()].sort((a, b) => b.totalCandidates - a.totalCandidates);
  const localitiesReport: LocalityCoverageRow[] = localities
    .map((l) => ({ localityName: l.name, candidateCount: localityCandidateCount.get(l.name) ?? 0 }))
    .sort((a, b) => a.candidateCount - b.candidateCount);

  return {
    developers,
    localities: localitiesReport,
    lowCoverageDevelopers: developers.filter((d) => d.isCurated && d.totalCandidates === 0).map((d) => d.developerName),
    lowCoverageLocalities: localitiesReport.filter((l) => l.candidateCount === 0).map((l) => l.localityName),
    totalCandidates: candidateRows.length,
    totalCuratedDevelopers: curatedDomains.length,
    totalMumbaiLocalities: localities.length,
    unresolvedDeveloperCandidates,
    unresolvedLocalityCandidates,
  };
}
