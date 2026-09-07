"use server";

import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError } from "./errors";
import type { Prisma } from "@prisma/client";
import { classifyProjectEnrichment, suppressPreviouslyRejectedProposals, applyFounderEditAuthority } from "@/lib/enrichment/classifyEnrichment";
import { getMostRecentEnrichmentEventsByField, RESEARCH_ENTITY_TYPE } from "@/lib/enrichment/enrichmentHistory";
import { runResearchProviders, DEFAULT_RESEARCH_PROVIDERS, type ResearchFinding, type ResearchProvider } from "@/lib/enrichment/researchProvider";
import { RESEARCHABLE_FIELD_KEYS, selectResearchTargetFields, generateResearchQueries, type ResearchQuerySet } from "@/lib/enrichment/researchQueryGeneration";
import { checkMumbaiScope, verifyResearchEvidenceIdentity, type ProjectIdentityContext } from "@/lib/enrichment/researchIdentityGuard";
import { buildEnrichmentSummary, readEnrichmentSummary } from "@/lib/enrichment/enrichmentSummary";
import { buildProjectReviewSnapshot, resolveOfficialDeveloperWebsite, type ProjectReviewSnapshot } from "./enrichment";
import type { EnrichmentField } from "@/lib/enrichment/types";
import type { ProjectImportPayload } from "@/lib/ingestion/connectors/fileImport/types";

/**
 * Targeted fix (Research Automation) -- the first production-safe layer
 * connecting the EXISTING founder Review/Enrichment workflow to research
 * evidence, whether that evidence comes from a future automated
 * ResearchProvider or from an interactive Claude+Chrome research pass.
 *
 * Deliberately reuses, never duplicates:
 *  - lib/enrichment/researchProvider.ts's runResearchProviders/
 *    classifyProjectEnrichment/mergeEnrichmentResults (the SAME
 *    classification engine every official adapter's findings already go
 *    through -- a research finding is indistinguishable, at the
 *    EnrichmentField level, from an official adapter's own finding).
 *  - suppressPreviouslyRejectedProposals/applyFounderEditAuthority (Task 2's
 *    founder-authority mechanism) -- a founder-edited value is exactly as
 *    protected from a research proposal as from a fresh official-adapter run.
 *  - buildEnrichmentSummary/readEnrichmentSummary (payload.enrichmentSummary)
 *    -- research runs persist their status through the EXACT SAME summary
 *    every Enrich Project run already writes, so the Review Queue badge,
 *    Approval Ready, and "N proposed/N conflict" counts need no new code at
 *    all to reflect a research run.
 *  - buildProjectReviewSnapshot/acceptEnrichmentFieldAction -- a research
 *    proposal is Accepted/Edited/Rejected through the EXACT SAME action and
 *    UI (EnrichmentProposalPanel) as any other enrichment field. This module
 *    never writes to Project, never approves, never publishes.
 *
 * Two entry points, both funneled through the SAME runResearchPipeline (so
 * identity verification, Mumbai-scope, founder-authority protection, and
 * persistence apply IDENTICALLY regardless of where a finding came from):
 *  - researchProjectAction: runs whatever ResearchProvider(s) are actually
 *    registered (DEFAULT_RESEARCH_PROVIDERS ships empty -- no search API
 *    credentials exist in this environment). Honest by construction: with
 *    zero providers configured, this returns NOT_CONFIGURED, never a fake
 *    "researching..." state with no real backend.
 *  - submitResearchFindingsAction: the concrete Claude+Chrome / interactive
 *    research handoff boundary (Section 18) -- accepts findings an external
 *    research pass already collected (each carrying identitySignals).
 */

export type ResearchRunStatus =
  | "SUCCESS"
  | "NO_NEW_INFO"
  | "OUT_OF_SCOPE"
  | "NOT_CONFIGURED"
  | "NO_TARGET_FIELDS"
  | "NOT_FOUND"
  | "ERROR";

export interface ResearchRunResult {
  status: ResearchRunStatus;
  error?: string;
  fields?: EnrichmentField[];
  /** Findings dropped by the identity/scope guard, for founder-visible transparency -- never silently discarded. */
  rejectedFindings?: { fieldKey: string; sourceUrl: string; reason: string }[];
  snapshot?: ProjectReviewSnapshot;
}

async function loadStagingRecord(stagingRecordId: string) {
  const record = await prisma.ingestStagingRecord.findUnique({ where: { id: stagingRecordId } });
  if (!record) return { ok: false as const, status: "NOT_FOUND" as const, error: "Staging record not found." };
  if (record.entityType !== "Project") return { ok: false as const, status: "ERROR" as const, error: "Research is only available for Project staging records." };
  if (record.status !== "PENDING") {
    return { ok: false as const, status: "ERROR" as const, error: "This record is no longer pending review -- it has already been approved or rejected." };
  }
  return { ok: true as const, record };
}

async function buildProjectIdentityContext(
  payload: ProjectImportPayload
): Promise<{ identity: ProjectIdentityContext; localityName: string | null; officialDeveloperWebsiteUrl: string | null }> {
  const [locality, officialDeveloperWebsiteUrl] = await Promise.all([
    payload.localityId ? prisma.locality.findUnique({ where: { id: payload.localityId }, select: { name: true } }) : Promise.resolve(null),
    resolveOfficialDeveloperWebsite(payload),
  ]);
  return {
    identity: { projectName: payload.name, developerName: payload.developerGroup ?? null, reraNumber: payload.reraNumber ?? null },
    localityName: locality?.name ?? null,
    officialDeveloperWebsiteUrl,
  };
}

/**
 * The FULL, current classification of every registry field with NO live
 * source facts (an empty SourceFactsMap) -- purely payload-derived
 * CONFIRMED/MISSING, per classifyProjectEnrichment's own rule 5. Any field
 * the last real Enrich Project run left outstanding (payload.enrichmentSummary.outstanding
 * -- GREEN_NEW/YELLOW/CONFLICT) overrides that baseline, since it's the
 * freshest known signal that a field genuinely still needs attention, even
 * though this function itself never re-fetches a live source.
 */
function buildResearchBaselineFields(
  payload: ProjectImportPayload,
  context: { localityName?: string | null; officialDeveloperWebsiteUrl?: string | null }
): EnrichmentField[] {
  const baseline = classifyProjectEnrichment(
    payload,
    { localityName: context.localityName ?? undefined, officialDeveloperWebsiteUrl: context.officialDeveloperWebsiteUrl },
    {},
    { url: "", tier: "OFFICIAL_DEVELOPER" }
  );
  const outstanding = readEnrichmentSummary(payload as unknown as Record<string, unknown>)?.outstanding ?? {};
  return baseline.map((field) => {
    const override = outstanding[field.key];
    if (!override) return field;
    return { ...field, classification: override, reason: "Outstanding from the most recent Enrich Project run." };
  });
}

/**
 * Wraps a provider so every finding it returns is checked against Section
 * 12's project-identity gate BEFORE it can reach classifyProjectEnrichment --
 * applies identically whether the underlying provider is a future automated
 * one or the ad-hoc "manual-submission" provider submitResearchFindingsAction
 * builds from externally-collected findings. Rejections are collected (not
 * silently dropped) via the shared `rejected` array the caller owns.
 */
function withIdentityGuard(
  provider: ResearchProvider,
  identity: ProjectIdentityContext,
  rejected: { fieldKey: string; sourceUrl: string; reason: string }[]
): ResearchProvider {
  return {
    name: provider.name,
    research: async (query) => {
      const findings = await provider.research(query);
      const verified: ResearchFinding[] = [];
      for (const finding of findings) {
        const result = verifyResearchEvidenceIdentity(identity, finding.identitySignals);
        if (result.verified) {
          verified.push(finding);
        } else {
          rejected.push({ fieldKey: finding.fieldKey, sourceUrl: finding.sourceUrl, reason: result.reason });
        }
      }
      return verified;
    },
  };
}

/**
 * How the set of fields to research for this run is decided:
 *  - "discover" (researchProjectAction/buildResearchPlanAction): the pipeline
 *    itself figures out which fields are worth researching -- restricted to
 *    MISSING/YELLOW/CONFLICT (Section 1's "research target field selection").
 *    A field that's already CONFIRMED/GREEN_NEW/FOUNDER_EDITED is never
 *    auto-targeted; nothing to search for.
 *  - "explicit" (submitResearchFindingsAction): the caller already knows
 *    exactly which fields it collected evidence for -- an externally-run
 *    research pass may legitimately re-confirm or cross-check a field that
 *    already has a value (including a founder-edited one, where the whole
 *    point is proving applyFounderEditAuthority still protects it). Using
 *    "discover"'s MISSING/YELLOW/CONFLICT gate here would incorrectly reject
 *    a perfectly valid submitted finding just because the field wasn't
 *    already flagged as outstanding.
 */
type TargetFieldMode = { type: "discover"; requestedFieldKeys?: string[] } | { type: "explicit"; fieldKeys: string[] };

async function runResearchPipeline(stagingRecordId: string, providers: ResearchProvider[], mode: TargetFieldMode, actorId: string): Promise<ResearchRunResult> {
  const loaded = await loadStagingRecord(stagingRecordId);
  if (!loaded.ok) return { status: loaded.status, error: loaded.error };
  const { record } = loaded;
  const payload = record.payload as unknown as ProjectImportPayload;
  const raw = payload as unknown as Record<string, unknown>;

  const { identity, localityName, officialDeveloperWebsiteUrl } = await buildProjectIdentityContext(payload);

  const scope = checkMumbaiScope({
    resolvedLocalityName: localityName,
    address: payload.address,
    microMarket: typeof raw.microMarketId === "string" ? raw.microMarketId : null,
  });
  if (!scope.inScope) {
    return { status: "OUT_OF_SCOPE", error: scope.reason };
  }

  const targetFieldKeys =
    mode.type === "discover" ? selectResearchTargetFields(buildResearchBaselineFields(payload, { localityName, officialDeveloperWebsiteUrl }), mode.requestedFieldKeys) : mode.fieldKeys;
  if (targetFieldKeys.length === 0) {
    return { status: "NO_TARGET_FIELDS", error: "Every researchable field is already resolved -- nothing to research." };
  }

  if (providers.length === 0) {
    return { status: "NOT_CONFIGURED", error: "No research providers are configured yet -- research cannot run automatically in this environment." };
  }

  await logAudit(actorId, "research.started", RESEARCH_ENTITY_TYPE, stagingRecordId, {
    after: { fieldKeys: targetFieldKeys, providerNames: providers.map((p) => p.name) },
  });

  const rejectedFindings: { fieldKey: string; sourceUrl: string; reason: string }[] = [];
  const guardedProviders = providers.map((p) => withIdentityGuard(p, identity, rejectedFindings));

  let fields: EnrichmentField[];
  try {
    const query = { projectName: payload.name, developerName: payload.developerGroup, fieldKeys: targetFieldKeys };
    const projectContext = { localityName: localityName ?? undefined, officialDeveloperWebsiteUrl };
    const merged = await runResearchProviders(guardedProviders, query, payload, projectContext);
    const recentEventsByField = await getMostRecentEnrichmentEventsByField(stagingRecordId);
    fields = applyFounderEditAuthority(suppressPreviouslyRejectedProposals(merged, recentEventsByField), recentEventsByField);
  } catch (error) {
    await logAudit(actorId, "research.failed", RESEARCH_ENTITY_TYPE, stagingRecordId, { after: { error: error instanceof Error ? error.message : String(error) } });
    return { status: "ERROR", error: "Research failed unexpectedly. See server logs." };
  }

  const hasNewInfo = fields.some(
    (f) => targetFieldKeys.includes(f.key) && (f.classification === "GREEN_NEW" || f.classification === "YELLOW" || f.classification === "CONFLICT")
  );

  if (!hasNewInfo) {
    await logAudit(actorId, "research.completed", RESEARCH_ENTITY_TYPE, stagingRecordId, { after: { status: "NO_NEW_INFO", fieldKeys: targetFieldKeys, rejectedFindings } });
    return { status: "NO_NEW_INFO", fields, rejectedFindings: rejectedFindings.length > 0 ? rejectedFindings : undefined };
  }

  // Idempotency (Section 20): buildEnrichmentSummary always OVERWRITES the
  // full outstanding map from this run's complete field list -- exactly
  // enrichProjectAction's own convention (see that function's doc comment:
  // "a new run is always the newest truth"). Running research twice with
  // identical evidence reclassifies to the SAME outstanding set, not a
  // duplicate; suppressPreviouslyRejectedProposals/applyFounderEditAuthority
  // (already applied above) are what actually prevent re-litigating a
  // founder's prior reject/edit decision on repeat runs.
  const summary = buildEnrichmentSummary("READY", fields);
  const payloadToWrite = { ...raw, enrichmentSummary: summary };
  try {
    await prisma.ingestStagingRecord.update({ where: { id: stagingRecordId }, data: { payload: payloadToWrite as unknown as Prisma.InputJsonValue } });
  } catch (error) {
    return { status: "ERROR", error: friendlyPrismaError(error) };
  }

  for (const field of fields) {
    if (!targetFieldKeys.includes(field.key)) continue;
    if (field.classification !== "GREEN_NEW" && field.classification !== "YELLOW" && field.classification !== "CONFLICT") continue;
    await logAudit(actorId, "research.proposal_created", RESEARCH_ENTITY_TYPE, stagingRecordId, {
      after: {
        fieldKey: field.key,
        proposedValue: field.proposedValue,
        classification: field.classification,
        sourceUrl: field.sourceUrl,
        confidence: field.confidence,
      },
    });
  }
  await logAudit(actorId, "research.completed", RESEARCH_ENTITY_TYPE, stagingRecordId, { after: { status: "READY", fieldKeys: targetFieldKeys, rejectedFindings } });

  const snapshot = await buildProjectReviewSnapshot(payloadToWrite, record.matchedExistingId);
  return { status: "SUCCESS", fields, snapshot, rejectedFindings: rejectedFindings.length > 0 ? rejectedFindings : undefined };
}

/**
 * Runs whatever providers are actually registered (DEFAULT_RESEARCH_PROVIDERS
 * today -- see this file's own top doc comment). `fieldKeys`, when given,
 * restricts research to that subset (Section 10: "support researching...
 * selected missing fields"); omitted, every currently research-worthy field
 * is targeted.
 */
export async function researchProjectAction(stagingRecordId: string, fieldKeys?: string[]): Promise<ResearchRunResult> {
  const session = await requireMutateSession();
  return runResearchPipeline(stagingRecordId, DEFAULT_RESEARCH_PROVIDERS, { type: "discover", requestedFieldKeys: fieldKeys }, session.userId);
}

/**
 * Section 18's concrete Claude+Chrome handoff boundary: `findings` were
 * already collected by an external, interactive research pass (a browser
 * agent that ran the queries generateResearchQueries produced and read the
 * resulting pages). Every finding is checked against RESEARCHABLE_FIELD_KEYS
 * up front (a structural allowlist, cheap and field-agnostic); everything
 * else -- identity verification, Mumbai-scope, founder-authority protection
 * -- goes through the EXACT SAME runResearchPipeline an automated provider
 * would use, via a single ad-hoc ResearchProvider wrapping the supplied
 * findings.
 */
export async function submitResearchFindingsAction(stagingRecordId: string, findings: ResearchFinding[]): Promise<ResearchRunResult> {
  const session = await requireMutateSession();

  const structurallyRejected: { fieldKey: string; sourceUrl: string; reason: string }[] = [];
  const structurallyValid = findings.filter((f) => {
    if (RESEARCHABLE_FIELD_KEYS.includes(f.fieldKey)) return true;
    structurallyRejected.push({ fieldKey: f.fieldKey, sourceUrl: f.sourceUrl, reason: `"${f.fieldKey}" is not a researchable field.` });
    return false;
  });

  if (structurallyValid.length === 0) {
    return { status: "NO_TARGET_FIELDS", error: "No submitted finding targets a researchable field.", rejectedFindings: structurallyRejected };
  }

  const manualProvider: ResearchProvider = { name: "manual-submission", research: async () => structurallyValid };
  const requestedFieldKeys = [...new Set(structurallyValid.map((f) => f.fieldKey))];
  const result = await runResearchPipeline(stagingRecordId, [manualProvider], { type: "explicit", fieldKeys: requestedFieldKeys }, session.userId);
  const combinedRejections = [...structurallyRejected, ...(result.rejectedFindings ?? [])];
  return { ...result, rejectedFindings: combinedRejections.length > 0 ? combinedRejections : undefined };
}

/**
 * Read-only helper for the founder UX (Section 16) -- the query plan a
 * research pass (automated or interactive) should execute for this
 * project's currently research-worthy fields. Never fetches anything.
 */
export async function buildResearchPlanAction(
  stagingRecordId: string
): Promise<{ status: "SUCCESS" | "NOT_FOUND" | "ERROR" | "OUT_OF_SCOPE" | "NO_TARGET_FIELDS"; error?: string; querySets?: ResearchQuerySet[]; targetFieldKeys?: string[] }> {
  await requireMutateSession();
  const loaded = await loadStagingRecord(stagingRecordId);
  if (!loaded.ok) return { status: loaded.status === "NOT_FOUND" ? "NOT_FOUND" : "ERROR", error: loaded.error };
  const payload = loaded.record.payload as unknown as ProjectImportPayload;
  const raw = payload as unknown as Record<string, unknown>;
  const { localityName, officialDeveloperWebsiteUrl } = await buildProjectIdentityContext(payload);

  const scope = checkMumbaiScope({ resolvedLocalityName: localityName, address: payload.address, microMarket: typeof raw.microMarketId === "string" ? raw.microMarketId : null });
  if (!scope.inScope) return { status: "OUT_OF_SCOPE", error: scope.reason };

  const baseline = buildResearchBaselineFields(payload, { localityName, officialDeveloperWebsiteUrl });
  const targetFieldKeys = selectResearchTargetFields(baseline);
  if (targetFieldKeys.length === 0) return { status: "NO_TARGET_FIELDS", error: "Every researchable field is already resolved." };

  const allQuerySets = generateResearchQueries({ projectName: payload.name, developerName: payload.developerGroup ?? undefined });
  const querySets = allQuerySets.filter((q) => targetFieldKeys.includes(q.fieldKey));
  return { status: "SUCCESS", querySets, targetFieldKeys };
}
