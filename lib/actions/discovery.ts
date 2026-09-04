"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMutateSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { PRIMARY_CITY_SLUG } from "@/lib/queries";
import { resolveBuilderMatch } from "@/lib/enrichment/resolveNamedEntity";
import type { ExistingProjectCandidate } from "@/lib/ingestion/duplicateMatch";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";
import { resolveAreaToLocality } from "@/lib/ingestion/discovery/areaLocalityResolution";
import { buildDiscoveryCandidate, type DiscoveryCandidateInput } from "@/lib/ingestion/discovery/buildCandidate";
import { classifyDiscoveryDuplicate } from "@/lib/ingestion/discovery/classifyDuplicate";
import {
  existingDiscoveryCandidatesAsExistingCandidates,
  mapDiscoveryCandidateToProjectPayload,
  pendingProjectStagingAsExistingCandidates,
} from "@/lib/ingestion/discovery/includeCandidate";
import { applyFounderDiscoveryAction, type DiscoveryFounderAction } from "@/lib/ingestion/discovery/statusTransitions";
import { DISCOVERY_ENTITY_TYPE, type DiscoveryStatus, type ProjectDiscoveryCandidatePayload } from "@/lib/ingestion/discovery/types";
import type { ConnectorRunSummary } from "@/lib/ingestion/types";
import { resolveDeveloperDomain } from "@/lib/enrichment/developerDomainRegistry";
import { discoverDeveloperProjects, type DeveloperDiscoveryResult } from "@/lib/ingestion/discovery/generic/discoverDeveloperProjects";
import { stageMumbaiDiscoveryCandidates, type DeveloperStagingTally } from "@/lib/ingestion/discovery/generic/stageMumbaiDiscoveryCandidates";
import { runWithConcurrency } from "@/lib/ingestion/discovery/generic/runWithConcurrency";

/**
 * Phase 39 Part H/K — stages a batch of discovery candidates for ONE already-
 * chosen area (a single existing Locality). Deliberately narrow: this is the
 * "prepare the data/control structure" step, not the future bulk-enrichment
 * runner — it writes ProjectDiscoveryCandidate staging rows (Part C), never a
 * real Project, and never approves/enriches anything. Reuses the exact same
 * IngestBatch + IngestStagingRecord write pattern every existing file-import
 * runner already uses (see lib/ingestion/fileImportRunner.ts), including its
 * "recordsWritten always 0 for a staging-only runner" convention.
 *
 * Phase 41 Part I — at BULK scale, duplicate protection now checks THREE
 * sources, not just the live Project table: (1) live Projects, (2) every
 * still-PENDING "Project"-entityType staging record (Phase 40's own
 * addition), and (3) every OTHER discovery candidate already sitting in the
 * Discovery Queue — including ones staged earlier in THIS SAME run, so two
 * near-duplicate rows in one research batch (e.g. "Godrej Sky Shore" and
 * "Godrej Skyshore, Versova" both submitted together) can't silently create
 * two separate candidates either. Still the exact same reused
 * classifyDiscoveryDuplicate/findPossibleDuplicateProject authority — only
 * the input list feeding it has grown.
 */
export type StageDiscoveryCandidateInput = Omit<DiscoveryCandidateInput, "localityId" | "batchLabel">;

export interface StageDiscoveryBatchParams {
  batchLabel: string;
  localityId: string;
  sourceKey: string;
  candidates: StageDiscoveryCandidateInput[];
}

export interface StageDiscoveryBatchResult extends ConnectorRunSummary {
  batchId: string;
}

export async function stageDiscoveryBatch(params: StageDiscoveryBatchParams): Promise<StageDiscoveryBatchResult> {
  const session = await requireMutateSession();

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

  const [liveProjects, pendingProjectStagingRaw, existingDiscoveryCandidatesRaw] = await Promise.all([
    prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: "Project" }, select: { id: true, payload: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: DISCOVERY_ENTITY_TYPE }, select: { id: true, payload: true } }),
  ]);

  // Grows as this loop stages new rows, so a duplicate WITHIN the same batch
  // is caught too, not just against rows that existed before this run started.
  const existingCandidates: ExistingProjectCandidate[] = [
    ...liveProjects,
    ...pendingProjectStagingAsExistingCandidates(pendingProjectStagingRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectImportPayload }))),
    ...existingDiscoveryCandidatesAsExistingCandidates(
      existingDiscoveryCandidatesRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectDiscoveryCandidatePayload })),
      params.localityId
    ),
  ];

  const batch = await prisma.ingestBatch.create({
    data: { sourceKey: params.sourceKey, trigger: "manual", triggeredByUserId: session.userId, status: "running" },
  });

  const summary: ConnectorRunSummary = { written: 0, skipped: 0, staged: 0, failed: 0 };

  for (const candidateInput of params.candidates) {
    try {
      const built = buildDiscoveryCandidate({ ...candidateInput, localityId: params.localityId, batchLabel: params.batchLabel }, existingCandidates);
      const created = await prisma.ingestStagingRecord.create({
        data: {
          batchId: batch.id,
          entityType: DISCOVERY_ENTITY_TYPE,
          status: built.status,
          payload: built.payload as unknown as Prisma.InputJsonValue,
          matchedExistingId: built.matchedExistingId,
          matchConfidence: built.matchConfidence,
        },
      });
      existingCandidates.push({ id: created.id, name: built.payload.projectName, localityId: params.localityId, reraNumber: null });
      summary.staged += 1;
    } catch {
      summary.failed += 1;
    }
  }

  await prisma.ingestBatch.update({
    where: { id: batch.id },
    data: { status: "success", finishedAt: new Date(), recordsWritten: summary.written, recordsSkipped: summary.skipped, recordsFailed: summary.failed },
  });

  await logAudit(session.userId, "discovery.batch.stage", "IngestBatch", batch.id, {
    after: { batchLabel: params.batchLabel, staged: summary.staged, failed: summary.failed },
  });

  return { ...summary, batchId: batch.id };
}

async function loadDiscoveryCandidate(id: string) {
  const record = await prisma.ingestStagingRecord.findUnique({ where: { id } });
  if (!record || record.entityType !== DISCOVERY_ENTITY_TYPE) return null;
  return record;
}

export interface DiscoveryFounderActionResult {
  ok: boolean;
  error?: string;
  /** Set only on a successful INCLUDE (Phase 40) — the id of the new `entityType: "Project"` IngestStagingRecord now sitting in the EXISTING Project Review Queue. */
  projectStagingRecordId?: string;
}

/**
 * Part I — the founder's one decision per candidate (Include / Exclude /
 * Review).
 *
 * Exclude/Review only ever relabel this one staging row's `status` — never
 * touch the Project table.
 *
 * Include (Phase 40 Part B/E) is the one action that can create a real
 * `entityType: "Project"` IngestStagingRecord, but ONLY after:
 *  1. applyFounderDiscoveryAction's pre-guard passes (not already
 *     REJECTED_DUPLICATE or PROJECT_STAGED);
 *  2. the candidate's `areaName` resolves to EXACTLY ONE existing Locality
 *     (Phase 33's resolveLocalityMatch, reused verbatim — never a guessed
 *     id; Phase 42 relaxed this from "confidence === 1 only" to "any
 *     SINGLE_MATCH", since resolveLocalityMatch's own fuzzy tier is already
 *     this codebase's established "unambiguous enough" bar elsewhere, and
 *     the stricter rule was refusing perfectly legitimate real candidates
 *     whose areaName is a micro-market-level refinement of the Locality
 *     name -- discovered by actually running a real batch, not a guess);
 *  3. the EXISTING Project duplicate matcher (classifyDiscoveryDuplicate,
 *     itself a thin reuse of findPossibleDuplicateProject) finds NO_MATCH
 *     against THREE sources (Part B/I): the live Project table, every
 *     still-PENDING "Project"-entityType staging record, and every OTHER
 *     discovery candidate already sitting in the Discovery Queue (Part E's
 *     own worked example: a discovery candidate can easily name a project
 *     that's already sitting in the Review Queue from an earlier import, or
 *     be a re-discovery of another candidate already parked in the same
 *     queue -- findPossibleDuplicateProject alone only ever checked the live
 *     table, so these extra lists are Phase 40/41's own small, precedented
 *     additions, mirroring transactionFileImportRunner.ts's identical
 *     dual-check for Transactions).
 * EXACT/CLEAR_ALIAS refuse and relabel the candidate REJECTED_DUPLICATE;
 * AMBIGUOUS refuses and relabels it NEEDS_REVIEW; only NO_MATCH proceeds.
 *
 * Never approves, rejects, or writes anything to the live Project table —
 * the new row is a normal PENDING Project staging candidate, exactly like
 * every other file-import row, waiting in the same Review Queue for a human
 * to Approve/Reject through the EXISTING, unmodified workflow.
 */
export async function applyDiscoveryFounderAction(id: string, action: DiscoveryFounderAction): Promise<DiscoveryFounderActionResult> {
  const session = await requireMutateSession();
  const record = await loadDiscoveryCandidate(id);
  if (!record) return { ok: false, error: "Discovery candidate not found." };

  const guard = applyFounderDiscoveryAction(record.status as DiscoveryStatus, action);
  if (!guard.ok) return { ok: false, error: guard.error };

  if (action !== "INCLUDE") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: guard.next, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await logAudit(session.userId, `discovery.candidate.${action.toLowerCase()}`, DISCOVERY_ENTITY_TYPE, id, {
      before: { status: record.status },
      after: { status: guard.next },
    });
    return { ok: true };
  }

  const candidatePayload = record.payload as unknown as ProjectDiscoveryCandidatePayload;

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) return { ok: false, error: `Primary city "${PRIMARY_CITY_SLUG}" is not seeded.` };

  const localities = await prisma.locality.findMany({
    where: { cityId: city.id },
    select: { id: true, name: true, aliases: { select: { alias: true } } },
  });
  // Phase 43 Part E -- resolveAreaToLocality layers one additional tier
  // (comma-segment exact matching + a small curated micro-market registry)
  // between resolveLocalityMatch's own exact and fuzzy tiers, so a real
  // address-style areaName ("Hrushikesh, Lokhandwala, Andheri (W)") resolves
  // confidently without weakening the fuzzy tier's own threshold (Phase 42's
  // fix stays in place as tier 4, last resort). See
  // lib/ingestion/discovery/areaLocalityResolution.ts for the full tier list.
  const localityMatch = resolveAreaToLocality(
    candidatePayload.areaName,
    localities.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases.map((a) => a.alias) }))
  );
  if (localityMatch.status !== "SINGLE_MATCH") {
    return {
      ok: false,
      error: `Could not confidently resolve area "${candidatePayload.areaName}" to exactly one existing locality (${localityMatch.status}). Resolve the locality manually before including this candidate.`,
    };
  }
  const resolvedLocalityId = localityMatch.localityId!;

  const [liveProjects, pendingProjectStagingRaw, otherDiscoveryCandidatesRaw] = await Promise.all([
    prisma.project.findMany({ where: { cityId: city.id }, select: { id: true, name: true, localityId: true, reraNumber: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: "Project" }, select: { id: true, payload: true } }),
    prisma.ingestStagingRecord.findMany({ where: { entityType: DISCOVERY_ENTITY_TYPE, id: { not: id } }, select: { id: true, payload: true } }),
  ]);
  const combinedExisting: ExistingProjectCandidate[] = [
    ...liveProjects,
    ...pendingProjectStagingAsExistingCandidates(
      pendingProjectStagingRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectImportPayload }))
    ),
    ...existingDiscoveryCandidatesAsExistingCandidates(
      otherDiscoveryCandidatesRaw.map((r) => ({ id: r.id, payload: r.payload as unknown as ProjectDiscoveryCandidatePayload })),
      resolvedLocalityId
    ),
  ];

  const dup = classifyDiscoveryDuplicate(combinedExisting, { name: candidatePayload.projectName, localityId: resolvedLocalityId });

  if (dup.duplicateStatus === "AMBIGUOUS") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "NEEDS_REVIEW", matchedExistingId: dup.match?.existingId ?? null, matchConfidence: dup.match?.confidence ?? null, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    return { ok: false, error: `Ambiguous match against an existing project ("${dup.match?.existingName}") — needs founder review before staging.` };
  }
  if (dup.duplicateStatus === "EXACT" || dup.duplicateStatus === "CLEAR_ALIAS") {
    await prisma.ingestStagingRecord.update({
      where: { id },
      data: { status: "REJECTED_DUPLICATE", matchedExistingId: dup.match?.existingId ?? null, matchConfidence: dup.match?.confidence ?? null, reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    return {
      ok: false,
      error: `This project already exists ("${dup.match?.existingName}", ${dup.duplicateStatus}) — not staged again. See IngestStagingRecord ${dup.match?.existingId}.`,
    };
  }

  // NO_MATCH -- safe to resolve a builder (never guessed: only an exact,
  // confidence-1 match auto-fills builderId; anything fuzzier is left for
  // the founder/enrichment's own existing Builder-resolution UI) and create
  // the new Project staging record.
  const builders = await prisma.builder.findMany({ select: { id: true, name: true, legalNames: true, reraNumber: true } });
  const builderMatch = resolveBuilderMatch(builders, candidatePayload.developerName);
  const resolvedBuilderId = builderMatch.status === "SINGLE_MATCH" && builderMatch.candidates[0].confidence === 1 ? builderMatch.candidates[0].id : null;

  const projectPayload = mapDiscoveryCandidateToProjectPayload(candidatePayload, resolvedLocalityId, resolvedBuilderId, id);

  const projectStagingRecord = await prisma.ingestStagingRecord.create({
    data: {
      batchId: record.batchId,
      entityType: "Project",
      status: "PENDING",
      payload: projectPayload as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.ingestStagingRecord.update({
    where: { id },
    data: { status: "PROJECT_STAGED", reviewedByUserId: session.userId, reviewedAt: new Date() },
  });

  await logAudit(session.userId, "discovery.candidate.include", DISCOVERY_ENTITY_TYPE, id, {
    before: { status: record.status },
    after: { status: "PROJECT_STAGED", projectStagingRecordId: projectStagingRecord.id },
  });

  return { ok: true, projectStagingRecordId: projectStagingRecord.id };
}

/** A full http(s):// URL, same discipline every other founder-facing URL field in this app already applies — never a bare domain or relative path. */
function isFullHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export interface DiscoveryCandidateEditInput {
  projectName?: string;
  developerName?: string;
  areaName?: string;
  /** The project-specific official page — e.g. https://gurukruparealcon.com/projects/gurukrupa-darshanam. Deliberately never inferred from officialDeveloperUrl. */
  sourceUrl?: string;
  /** The developer's own homepage — e.g. https://gurukruparealcon.com/. Deliberately never inferred from sourceUrl, and never used as a stand-in for a project-specific page. */
  officialDeveloperUrl?: string;
  founderStatusNote?: string;
  founderDecisionNote?: string;
}

/**
 * Phase 59 — lets a founder correct/enter a discovery candidate's own details
 * (never a real Project's) before or after deciding Include/Exclude/Review.
 * Deliberately narrow: edits ONLY the fields Part 1 of the phase spec lists,
 * on the SAME ProjectDiscoveryCandidatePayload the pipeline already writes —
 * no new model, no Project-table write, no re-run of the discovery pipeline.
 * Reuses the existing AuditLog (logAudit) exactly as applyDiscoveryFounderAction
 * already does, rather than a new history mechanism.
 *
 * `sourceUrl` (the project-specific page) and `officialDeveloperUrl` (the
 * developer's homepage) are edited independently on purpose — Part 1's own
 * instruction is that a developer homepage must never be silently treated as
 * a project page. Saving officialDeveloperUrl alone marks officialSourceStatus
 * IDENTIFIED without ever touching sourceUrl.
 */
export async function updateDiscoveryCandidateDetails(id: string, edits: DiscoveryCandidateEditInput): Promise<{ ok: boolean; error?: string }> {
  const session = await requireMutateSession();
  const record = await loadDiscoveryCandidate(id);
  if (!record) return { ok: false, error: "Discovery candidate not found." };

  const before = record.payload as unknown as ProjectDiscoveryCandidatePayload;
  const after: ProjectDiscoveryCandidatePayload = { ...before };

  if (edits.projectName !== undefined) {
    const trimmed = edits.projectName.trim();
    if (!trimmed) return { ok: false, error: "Project name can't be empty." };
    after.projectName = trimmed;
  }
  if (edits.developerName !== undefined) {
    const trimmed = edits.developerName.trim();
    if (!trimmed) return { ok: false, error: "Developer can't be empty." };
    after.developerName = trimmed;
  }
  if (edits.areaName !== undefined) {
    const trimmed = edits.areaName.trim();
    if (!trimmed) return { ok: false, error: "Locality can't be empty." };
    after.areaName = trimmed;
  }
  if (edits.sourceUrl !== undefined) {
    const trimmed = edits.sourceUrl.trim();
    if (!trimmed) return { ok: false, error: "Project source URL can't be empty — clear it isn't supported, only replaced." };
    if (!isFullHttpUrl(trimmed)) return { ok: false, error: "Project source URL must be a full http:// or https:// URL." };
    after.sourceUrl = trimmed;
  }
  if (edits.officialDeveloperUrl !== undefined) {
    const trimmed = edits.officialDeveloperUrl.trim();
    if (trimmed && !isFullHttpUrl(trimmed)) return { ok: false, error: "Developer website URL must be a full http:// or https:// URL." };
    after.officialDeveloperUrl = trimmed || null;
    after.officialSourceStatus = trimmed ? "IDENTIFIED" : "OFFICIAL_SOURCE_UNKNOWN";
  }
  if (edits.founderStatusNote !== undefined) after.founderStatusNote = edits.founderStatusNote.trim() || null;
  if (edits.founderDecisionNote !== undefined) after.founderDecisionNote = edits.founderDecisionNote.trim() || null;

  await prisma.ingestStagingRecord.update({ where: { id }, data: { payload: after as unknown as Prisma.InputJsonValue } });
  await logAudit(session.userId, "discovery.candidate.edit", DISCOVERY_ENTITY_TYPE, id, { before, after });

  return { ok: true };
}

const DISCOVERY_USER_AGENT = "Mozilla/5.0 (compatible; MumbaiIntelBot/1.0)";
/** Part L — start conservative: two developers scanned at once, never a burst against many sites simultaneously. */
const DEVELOPER_SCAN_CONCURRENCY = 2;

export interface RunMumbaiDiscoveryResult {
  batchId: string | null;
  developersRequested: number;
  developersScanned: number;
  /** A requested name that isn't in the curated developerDomainRegistry yet — never scanned with a guessed domain (Part B). */
  developersSkippedUnknownDomain: string[];
  developerClassifications: Record<string, DeveloperDiscoveryResult["classification"]>;
  candidateUrlsDiscoveredTotal: number;
  pagesFetchedTotal: number;
  totals: DeveloperStagingTally;
  perDeveloper: Record<string, DeveloperStagingTally>;
  durationMs: number;
}

/**
 * Phase 55 Part J — the smallest practical automation trigger: a founder
 * hands this a list of developer NAMES (must already be curated in
 * developerDomainRegistry.ts — Part B forbids guessing a domain here too),
 * and it runs the full discovery → Mumbai/status filter → duplicate-
 * protected staging pipeline (Part C–K), landing results in the EXISTING,
 * unmodified Discovery Queue (/admin/data-sync/discovery) for founder
 * review. Never approves, never enriches, never touches Transactions —
 * exactly Part K's "discovery only" scope.
 *
 * Runs synchronously inside the request (no queue/job infrastructure, per
 * Part O) — for a large developer list this can take several minutes
 * (network-bound: robots.txt + sitemap + a bounded sample of project pages
 * per developer). The founder should run it in reasonably sized batches.
 */
export async function runMumbaiDiscoveryBatch(
  developerNames: string[],
  opts?: { maxPagesToFetch?: number }
): Promise<RunMumbaiDiscoveryResult> {
  const start = Date.now();
  const session = await requireMutateSession();

  const city = await prisma.city.findUnique({ where: { slug: PRIMARY_CITY_SLUG }, select: { id: true } });
  if (!city) throw new Error(`Primary city "${PRIMARY_CITY_SLUG}" is not seeded`);

  const skippedUnknownDomain: string[] = [];
  const targets: { developerName: string; domain: string }[] = [];
  for (const name of developerNames) {
    const domain = resolveDeveloperDomain(name);
    if (!domain) {
      skippedUnknownDomain.push(name);
      continue;
    }
    targets.push({ developerName: name, domain });
  }

  const scanResults = await runWithConcurrency(targets, DEVELOPER_SCAN_CONCURRENCY, (t) =>
    discoverDeveloperProjects(t.developerName, t.domain, {
      fetchImpl: fetch,
      userAgent: DISCOVERY_USER_AGENT,
      maxPagesToFetch: opts?.maxPagesToFetch,
    })
  );
  const developerResults: DeveloperDiscoveryResult[] = scanResults.filter((r) => r.result !== null).map((r) => r.result!);

  const batchLabel = `Mumbai Discovery — ${new Date().toISOString().slice(0, 10)}`;
  const stageOutcome = await stageMumbaiDiscoveryCandidates({
    prisma,
    cityId: city.id,
    batchLabel,
    sourceKey: `mumbai-discovery-auto:${Date.now()}`,
    triggeredByUserId: session.userId,
    developerResults,
  });

  const candidateUrlsDiscoveredTotal = developerResults.reduce((sum, r) => sum + r.candidateUrlsIdentified, 0);
  const pagesFetchedTotal = developerResults.reduce((sum, r) => sum + r.pagesFetched, 0);
  const durationMs = Date.now() - start;

  // Phase 63 — captures the fuller metric set (previously only staged/
  // needsReview/rejectedDuplicate) so a later run's numbers can be compared
  // against this one via the existing AuditLog, without a new metrics table.
  await logAudit(session.userId, "discovery.mumbai_auto_run", "IngestBatch", stageOutcome.batchId, {
    after: {
      batchLabel,
      developersRequested: developerNames.length,
      developersScanned: developerResults.length,
      developersSkippedUnknownDomain: skippedUnknownDomain,
      // Phase 64 — per-developer detail (classification + raw fetch counts) was
      // previously only ever visible in the transient client-side result of
      // one specific run, never persisted -- a real gap when producing any
      // later coverage report. Small, additive: same shape already returned
      // to the caller, just also written to the existing AuditLog record.
      perDeveloper: developerResults.map((r) => ({
        developerName: r.developerName,
        domain: r.domain,
        classification: r.classification,
        sitemapPageUrlsFound: r.sitemapPageUrlsFound,
        candidateUrlsIdentified: r.candidateUrlsIdentified,
        pagesFetched: r.pagesFetched,
        pagesFailed: r.pagesFailed,
        robotsFetched: r.robotsFetched,
        disallowsEverythingForAllAgents: r.disallowsEverythingForAllAgents,
      })),
      candidateUrlsDiscoveredTotal,
      pagesFetchedTotal,
      staged: stageOutcome.totals.staged,
      needsReview: stageOutcome.totals.needsReview,
      rejectedDuplicate: stageOutcome.totals.rejectedDuplicate,
      excludedStatus: stageOutcome.totals.excludedStatus,
      excludedNoName: stageOutcome.totals.excludedNoName,
      excludedNoLocationText: stageOutcome.totals.excludedNoLocationText,
      excludedLocationUnresolved: stageOutcome.totals.excludedLocationUnresolved,
      excludedMmrLocation: stageOutcome.totals.excludedMmrLocation,
      ambiguousLocation: stageOutcome.totals.ambiguousLocation,
      durationMs,
    },
  });

  return {
    batchId: stageOutcome.batchId,
    developersRequested: developerNames.length,
    developersScanned: developerResults.length,
    developersSkippedUnknownDomain: skippedUnknownDomain,
    developerClassifications: Object.fromEntries(developerResults.map((r) => [r.developerName, r.classification])),
    candidateUrlsDiscoveredTotal,
    pagesFetchedTotal,
    totals: stageOutcome.totals,
    perDeveloper: stageOutcome.perDeveloper,
    durationMs,
  };
}

export interface RunMumbaiDiscoveryFormState {
  error?: string;
  result?: RunMumbaiDiscoveryResult;
}

/** Thin `useActionState`-compatible wrapper around runMumbaiDiscoveryBatch — parses a comma/newline-separated developer-name textarea (Part J's minimal trigger). */
export async function runMumbaiDiscoveryFormAction(
  _prev: RunMumbaiDiscoveryFormState,
  formData: FormData
): Promise<RunMumbaiDiscoveryFormState> {
  const raw = String(formData.get("developerNames") ?? "");
  const developerNames = [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  if (developerNames.length === 0) {
    return { error: "Enter at least one developer name (comma or newline separated)." };
  }
  try {
    const result = await runMumbaiDiscoveryBatch(developerNames);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
