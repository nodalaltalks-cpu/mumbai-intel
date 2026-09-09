import "server-only";
import { prisma } from "@/lib/prisma";
import { RESEARCH_ENTITY_TYPE, ENRICHMENT_HISTORY_ENTITY_TYPE, type EnrichmentHistorySnapshot } from "./enrichmentHistory";

/**
 * Founder Review Queue — Search + Agent Change Visibility (Part 3/4/5/6).
 *
 * Deliberately a READ-ONLY correlation layer over the EXISTING AuditLog rows
 * lib/actions/research.ts and lib/actions/enrichment.ts already write — no
 * new table, no new column, no second audit/history mechanism, and no change
 * to how research or enrichment acceptance is persisted.
 *
 * How the correlation works (both halves already exist, unmodified):
 *  - runResearchPipeline (lib/actions/research.ts) logs one
 *    `research.proposal_created` AuditLog row (entityType=RESEARCH_ENTITY_TYPE,
 *    entityId=stagingRecordId) per field that a verified research finding
 *    actually turned into a GREEN_NEW/YELLOW/CONFLICT proposal, carrying that
 *    field's exact `sourceUrl`.
 *  - acceptEnrichmentFieldAction/rejectEnrichmentFieldAction
 *    (lib/actions/enrichment.ts) log one `enrichment.*` AuditLog row
 *    (entityType=ENRICHMENT_HISTORY_ENTITY_TYPE, same entityId) per founder
 *    decision, whose `after.sourceUrl` is the SAME EnrichmentField.sourceUrl
 *    the founder was looking at when they decided — regardless of whether
 *    that field reached them via the Enrich Project dialog or the Research
 *    dialog, since both dialogs call the exact same accept/reject actions
 *    (see ReviewQueueList.tsx).
 *
 * A field's most recent decision whose `sourceUrl` matches a
 * `research.proposal_created` sourceUrl for that same field key is therefore
 * REAL, ALREADY-PERSISTED evidence that a research proposal (not a plain
 * Enrich Project run) is what the founder acted on -- never inferred merely
 * from "Research Project was clicked" or "this project has been enriched".
 *
 * Provider attribution: `research.started` persists the real provider name(s)
 * that ran. Today the only provider that ever reaches that log line is
 * "manual-submission" -- the exact name submitResearchFindingsAction (the
 * Claude+Chrome / interactive research handoff, see that file's own doc
 * comment) gives its ad-hoc ResearchProvider wrapper. DEFAULT_RESEARCH_PROVIDERS
 * ships empty, so researchProjectAction alone can never produce a
 * research.started row. Labeling "manual-submission" as "Claude + Chrome" is
 * therefore a truthful read of what's already persisted, not a guess -- a
 * future automated provider with a different name falls back to the generic,
 * still-truthful "Research Agent" label (Part 11's explicit instruction).
 */

export type ResearchFieldStatus = "ACCEPTED" | "FOUNDER_EDITED" | "REJECTED" | "CONFLICT" | "PENDING";

export interface ResearchFieldAttribution {
  fieldKey: string;
  classification: "GREEN_NEW" | "YELLOW" | "CONFLICT";
  proposedValue: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  proposedAt: string;
  status: ResearchFieldStatus;
  /** The founder's decision snapshot, when one exists -- carries displayValue/reason/founderEdited/overriddenValue exactly as persisted, so a "Research Changes" view never has to re-derive them. */
  decision: EnrichmentHistorySnapshot | null;
  decidedAt: string | null;
}

export interface ProjectResearchActivity {
  hasResearch: boolean;
  /** Truthful label derived from the real persisted provider name(s) -- see this file's own doc comment. Null when hasResearch is false. */
  providerLabel: "Claude + Chrome" | "Research Agent" | null;
  lastResearchAt: string | null;
  /**
   * Project-wide, independent of research: true when ANY field on this
   * record has ever been accepted with `founderEdited: true` (see
   * acceptEnrichmentFieldAction's own AcceptEnrichmentFieldContext) --
   * regardless of whether that edit happened to override a research proposal
   * or a plain Enrich Project one. Used by the Review Queue's Origin filter
   * (Part 2/Part 3's "Founder Edited" is its own dimension, not scoped to
   * research alone).
   */
  hasFounderEdit: boolean;
  /** Findings that passed the identity/scope guard and became a real proposal -- i.e. fields.length. */
  passedVerification: number;
  /** Findings the identity/scope guard rejected outright (real persisted count from research.completed's own rejectedFindings, never fabricated). */
  rejectedByVerification: number;
  accepted: number;
  founderEdited: number;
  rejected: number;
  conflicts: number;
  pending: number;
  fields: ResearchFieldAttribution[];
}

const EMPTY_ACTIVITY: ProjectResearchActivity = {
  hasResearch: false,
  providerLabel: null,
  lastResearchAt: null,
  hasFounderEdit: false,
  passedVerification: 0,
  rejectedByVerification: 0,
  accepted: 0,
  founderEdited: 0,
  rejected: 0,
  conflicts: 0,
  pending: 0,
  fields: [],
};

function isFieldSnapshot(value: unknown): value is EnrichmentHistorySnapshot {
  return Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).fieldKey === "string";
}

interface AuditRowLike {
  entityType: string;
  action: string;
  before: unknown;
  after: unknown;
  at: Date;
}

function buildActivityForRecord(rows: AuditRowLike[]): ProjectResearchActivity {
  const researchRows = rows.filter((r) => r.entityType === RESEARCH_ENTITY_TYPE);
  const fieldRows = rows.filter((r) => r.entityType === ENRICHMENT_HISTORY_ENTITY_TYPE);

  // rows are supplied oldest-first (see getResearchActivityForStagingIds), so
  // the last write for a given key, iterated in order, is always the latest.
  const proposalsByField = new Map<
    string,
    { classification: "GREEN_NEW" | "YELLOW" | "CONFLICT"; proposedValue: string | null; sourceUrl: string | null; confidence: string | null; at: string }
  >();
  let providerNames: string[] = [];
  let lastResearchAt: string | null = null;
  let rejectedByVerification = 0;

  for (const row of researchRows) {
    const after = row.after as Record<string, unknown> | null;
    if (row.action === "research.started" && Array.isArray(after?.providerNames)) {
      providerNames = after!.providerNames as string[];
    }
    if (row.action === "research.proposal_created" && after && typeof after.fieldKey === "string") {
      proposalsByField.set(after.fieldKey, {
        classification: after.classification as "GREEN_NEW" | "YELLOW" | "CONFLICT",
        proposedValue: typeof after.proposedValue === "string" ? after.proposedValue : null,
        sourceUrl: typeof after.sourceUrl === "string" ? after.sourceUrl : null,
        confidence: typeof after.confidence === "string" ? after.confidence : null,
        at: row.at.toISOString(),
      });
      lastResearchAt = row.at.toISOString();
    }
    if (row.action === "research.completed") {
      lastResearchAt = row.at.toISOString();
      if (Array.isArray(after?.rejectedFindings)) rejectedByVerification += (after!.rejectedFindings as unknown[]).length;
    }
  }

  const hasFounderEdit = fieldRows.some((row) => {
    const after = row.after as Record<string, unknown> | null;
    return (row.action === "enrichment.accept" || row.action === "enrichment.edit_accept" || row.action === "enrichment.re_accept") && after?.founderEdited === true;
  });

  if (proposalsByField.size === 0) return { ...EMPTY_ACTIVITY, hasFounderEdit };

  // Most recent enrichment-history event per field key (fieldRows is already
  // oldest-first, so the last match wins) -- exactly
  // getMostRecentEnrichmentEventsByField's own approach, inlined here since
  // this already has both entity types' rows loaded in one batched query.
  const latestFieldEvent = new Map<string, { action: string; after: EnrichmentHistorySnapshot | null; at: string }>();
  for (const row of fieldRows) {
    const after = row.after as unknown;
    const before = row.before as unknown;
    const key = isFieldSnapshot(after) ? after.fieldKey : isFieldSnapshot(before) ? before.fieldKey : null;
    if (!key) continue;
    latestFieldEvent.set(key, { action: row.action, after: isFieldSnapshot(after) ? after : null, at: row.at.toISOString() });
  }

  const fields: ResearchFieldAttribution[] = [];
  let accepted = 0;
  let founderEdited = 0;
  let rejected = 0;
  let conflicts = 0;
  let pending = 0;

  for (const [fieldKey, proposal] of proposalsByField) {
    const latest = latestFieldEvent.get(fieldKey) ?? null;
    let status: ResearchFieldStatus;
    if (!latest) {
      status = proposal.classification === "CONFLICT" ? "CONFLICT" : "PENDING";
    } else if (latest.action === "enrichment.reject") {
      status = "REJECTED";
    } else if (latest.action === "enrichment.revert") {
      status = proposal.classification === "CONFLICT" ? "CONFLICT" : "PENDING";
    } else {
      // ACCEPT / EDIT_ACCEPT / RE_ACCEPT
      status = latest.after?.founderEdited ? "FOUNDER_EDITED" : "ACCEPTED";
    }

    if (status === "ACCEPTED") accepted++;
    else if (status === "FOUNDER_EDITED") founderEdited++;
    else if (status === "REJECTED") rejected++;
    else if (status === "CONFLICT") conflicts++;
    else pending++;

    fields.push({
      fieldKey,
      classification: proposal.classification,
      proposedValue: proposal.proposedValue,
      sourceUrl: proposal.sourceUrl,
      confidence: proposal.confidence,
      proposedAt: proposal.at,
      status,
      decision: latest?.after ?? null,
      decidedAt: latest?.at ?? null,
    });
  }

  const providerLabel: ProjectResearchActivity["providerLabel"] = providerNames.includes("manual-submission") ? "Claude + Chrome" : "Research Agent";

  return {
    hasResearch: true,
    providerLabel,
    lastResearchAt,
    hasFounderEdit,
    passedVerification: fields.length,
    rejectedByVerification,
    accepted,
    founderEdited,
    rejected,
    conflicts,
    pending,
    fields,
  };
}

/**
 * Batched, read-only lookup for every staging record id given -- ONE AuditLog
 * query regardless of how many records the Review Queue is rendering (see
 * `@@index([entityType, entityId])`), never an N+1 per card. Records with no
 * research activity at all get the shared EMPTY_ACTIVITY constant (hasResearch:
 * false) rather than a per-record allocation.
 */
export async function getResearchActivityForStagingIds(stagingRecordIds: string[]): Promise<Map<string, ProjectResearchActivity>> {
  const result = new Map<string, ProjectResearchActivity>();
  if (stagingRecordIds.length === 0) return result;

  const rows = await prisma.auditLog.findMany({
    where: { entityType: { in: [RESEARCH_ENTITY_TYPE, ENRICHMENT_HISTORY_ENTITY_TYPE] }, entityId: { in: stagingRecordIds } },
    orderBy: { at: "asc" },
    select: { entityType: true, entityId: true, action: true, before: true, after: true, at: true },
  });

  const byRecord = new Map<string, AuditRowLike[]>();
  for (const row of rows) {
    const arr = byRecord.get(row.entityId);
    if (arr) arr.push(row);
    else byRecord.set(row.entityId, [row]);
  }

  for (const id of stagingRecordIds) {
    result.set(id, buildActivityForRecord(byRecord.get(id) ?? []));
  }
  return result;
}

/** Convenience single-record wrapper for callers that only ever need one (e.g. a project detail view opened on its own). */
export async function getResearchActivityForStagingId(stagingRecordId: string): Promise<ProjectResearchActivity> {
  const map = await getResearchActivityForStagingIds([stagingRecordId]);
  return map.get(stagingRecordId) ?? EMPTY_ACTIVITY;
}
