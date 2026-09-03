import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ENRICHMENT_HISTORY_ENTITY_TYPE } from "@/lib/enrichment/enrichmentHistory";

/**
 * Phase 62A — Founder Exception Queue.
 *
 * Deliberately reuses the EXISTING AuditLog table (same one Phase 37's
 * enrichment history and Phase 61's `enrichment.autoAccept.evidence` already
 * write to) rather than a new table: an exception is conceptually just
 * another kind of enrichment-history event, scoped by the same
 * `entityType=ENRICHMENT_HISTORY_ENTITY_TYPE, entityId=stagingRecordId` pair
 * every other enrichment audit entry already uses.
 *
 * This is a DELIBERATE, human/investigation-triggered signal, not something
 * `decideFieldAutomation` produces automatically. That function's own
 * MISSING output is intentionally left unchanged (it still just means "no
 * evidence found in this run" -- ambiguous between "not yet attempted" and
 * "reasonably exhausted"). Only a caller that has genuinely exhausted
 * reasonable sources should call `recordFounderException` to promote a
 * MISSING field into a tracked founder exception. Nothing in this module
 * converts MISSING -> FOUNDER_UPDATE_REQUIRED on its own.
 */

export const FOUNDER_EXCEPTION_ACTION = "enrichment.founderException";

export interface FounderExceptionEvidence {
  /** Human-readable reason the value couldn't be obtained. */
  reason: string;
  /** Sources actually checked, in plain language (not necessarily URLs -- e.g. "Existing Kalpataru adapter evidence"). */
  sourcesChecked: string[];
  /** The single most relevant/last source attempted, for quick founder context. */
  lastAttemptedSource: string;
  /** What the founder should actually do next. */
  recommendedFounderAction: string;
}

/**
 * Raises (or re-raises) a founder exception for one field on one staging
 * record. Safe to call more than once for the same field -- `getFounderExceptions`
 * only ever surfaces the MOST RECENT raise per (stagingRecordId, fieldKey).
 * Never touches the staging payload, the Project row, or any approval state.
 */
export async function recordFounderException(
  actorId: string | null,
  stagingRecordId: string,
  fieldKey: string,
  evidence: FounderExceptionEvidence
): Promise<void> {
  await logAudit(actorId, FOUNDER_EXCEPTION_ACTION, ENRICHMENT_HISTORY_ENTITY_TYPE, stagingRecordId, {
    after: { fieldKey, status: "FOUNDER_UPDATE_REQUIRED", ...evidence },
  });
}

export interface FounderExceptionRow {
  auditId: string;
  stagingRecordId: string;
  projectId: string | null;
  projectName: string;
  projectSlug: string | null;
  fieldKey: string;
  currentValue: unknown;
  reason: string;
  sourcesChecked: string[];
  lastAttemptedSource: string;
  recommendedFounderAction: string;
  raisedAt: Date;
  /** Derived, never stored: true once the underlying field (Project column if approved, else the staging payload) is no longer null/blank. */
  resolved: boolean;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

// Safety cap on how many historical raises are ever loaded before dedup/pagination --
// current volume is tiny (a handful of projects); revisit if this table grows into the
// thousands of raised-ever exceptions (see Phase 62A report's "remaining limitations").
const MAX_RAISED_EVER = 2000;

export type FounderExceptionFilter = "all" | "open" | "resolved";

export async function getFounderExceptions(options: {
  page?: number;
  pageSize?: number;
  filter?: FounderExceptionFilter;
} = {}): Promise<{ items: FounderExceptionRow[]; total: number; totalPages: number; openCount: number; openProjectCount: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const filter = options.filter ?? "open";

  // One query for every raise ever recorded (bounded), one for the staging records they
  // reference, one for whichever of those have been approved into a real Project -- three
  // queries total regardless of how many exceptions exist, not per-row.
  const rows = await prisma.auditLog.findMany({
    where: { action: FOUNDER_EXCEPTION_ACTION, entityType: ENRICHMENT_HISTORY_ENTITY_TYPE },
    orderBy: { at: "desc" },
    take: MAX_RAISED_EVER,
  });

  const latestByKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const after = row.after as Record<string, unknown> | null;
    const fieldKey = typeof after?.fieldKey === "string" ? after.fieldKey : null;
    if (!fieldKey) continue;
    const key = `${row.entityId}:${fieldKey}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row); // rows are already newest-first
  }
  const latest = Array.from(latestByKey.values());

  const stagingIds = [...new Set(latest.map((r) => r.entityId))];
  const stagingRecords = stagingIds.length
    ? await prisma.ingestStagingRecord.findMany({
        where: { id: { in: stagingIds } },
        select: { id: true, payload: true, appliedEntityId: true },
      })
    : [];
  const stagingById = new Map(stagingRecords.map((s) => [s.id, s]));

  const projectIds = [...new Set(stagingRecords.map((s) => s.appliedEntityId).filter((id): id is string => Boolean(id)))];
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } } }) : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const built: FounderExceptionRow[] = latest.map((row) => {
    const after = row.after as Record<string, unknown>;
    const fieldKey = after.fieldKey as string;
    const staging = stagingById.get(row.entityId);
    const stagingPayload = (staging?.payload as Record<string, unknown> | undefined) ?? {};
    const project = staging?.appliedEntityId ? projectById.get(staging.appliedEntityId) : undefined;
    const currentValue = project ? (project as unknown as Record<string, unknown>)[fieldKey] : stagingPayload[fieldKey];

    return {
      auditId: row.id,
      stagingRecordId: row.entityId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? (typeof stagingPayload.name === "string" ? stagingPayload.name : "Unknown project"),
      projectSlug: project?.slug ?? null,
      fieldKey,
      currentValue: currentValue ?? null,
      reason: typeof after.reason === "string" ? after.reason : "Reason not recorded",
      sourcesChecked: Array.isArray(after.sourcesChecked) ? (after.sourcesChecked as string[]) : [],
      lastAttemptedSource: typeof after.lastAttemptedSource === "string" ? after.lastAttemptedSource : "Source not recorded",
      recommendedFounderAction: typeof after.recommendedFounderAction === "string" ? after.recommendedFounderAction : "Reason not recorded",
      raisedAt: row.at,
      resolved: !isBlank(currentValue ?? null),
    };
  });

  built.sort((a, b) => b.raisedAt.getTime() - a.raisedAt.getTime());

  const openItems = built.filter((r) => !r.resolved);
  const filtered = filter === "all" ? built : filter === "open" ? openItems : built.filter((r) => r.resolved);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    items,
    total,
    totalPages,
    openCount: openItems.length,
    openProjectCount: new Set(openItems.map((r) => r.stagingRecordId)).size,
  };
}
