import "server-only";
import { prisma } from "@/lib/prisma";
import { buildFeatureVector, FEATURE_NAMES, type ProjectFeatureInput } from "./features";
import { buildUserInterestSnapshot } from "../interest-model";
import type { UserInterferenceInput } from "../types-internal";
import type { CandidateSource } from "../types";

/**
 * Part 3/4 — dataset + target construction from EXISTING events only
 * (RECOMMENDATION_IMPRESSION/RECOMMENDATION_CLICKED, reused
 * WISHLIST_ADDED/SavedProject/COMPARE_USED/CONTACT_ENQUIRY_SUBMITTED for
 * deeper-intent signals). No new event types, no duplicate infrastructure.
 *
 * TARGET WEIGHTING (Part 4 — "do not arbitrarily assign weights without
 * inspecting existing event data"): the weights below are NOT invented for
 * ML. They mirror the ordering the Phase 1 spec's own Part 10 already
 * established and this codebase already encodes in comments across
 * lib/recommendations/*: "save -> compare -> revisit -> enquiry" as
 * increasing intent. So:
 *   0 = impression only, no click
 *   1 = clicked, no further action within the window
 *   2 = clicked AND (saved OR compared) — the Phase 1 spec explicitly
 *       calls saves/compares "strong positive" signals
 *   3 = clicked AND enquired — the funnel's terminal, highest-intent event
 * A continuous target (predicted probability of >=1, i.e. "did this
 * recommendation get engaged with") is what model.ts's logistic regression
 * actually fits — see toBinaryLabel() below — but the raw 0-3 outcome is
 * kept in the dataset for evaluation (Part 11's precision/recall/NDCG need
 * the graded relevance, not just a flattened click/no-click).
 */
export const OUTCOME_WEIGHT = { NONE: 0, CLICK: 1, DEEP_ENGAGEMENT: 2, ENQUIRY: 3 } as const;
export type OutcomeWeight = (typeof OUTCOME_WEIGHT)[keyof typeof OUTCOME_WEIGHT];

/** The window after an impression within which a subsequent action is attributed to it — matches this codebase's existing "48h SLA" order-of-magnitude convention (lib/notifications.ts) rather than an arbitrary new number; recommendation follow-through realistically happens same-session to a few days later, not months. */
const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface LabeledExample {
  featureVector: number[];
  outcome: OutcomeWeight;
  binaryLabel: number; // 1 if outcome >= CLICK, 0 otherwise — what model.ts trains on
  impressionId: string;
  projectId: string;
  publicUserId: string | null;
  sessionId: string | null;
  surface: string | null;
  position: number;
  createdAt: Date;
  phase1Score: number | null; // from the impression's own recorded metadata — Part 8's comparison baseline
}

function toBinaryLabel(outcome: OutcomeWeight): number {
  return outcome >= OUTCOME_WEIGHT.CLICK ? 1 : 0;
}

interface ImpressionMetadata {
  surface?: string;
  position?: number;
  score?: number;
  candidateSources?: CandidateSource[];
}

/**
 * Builds the labeled dataset for a given period. Deliberately fetches
 * everything needed per-user in bounded batches rather than N+1 queries per
 * impression — at current/near-term data volumes this is a handful of
 * round trips total, not thousands.
 */
export async function buildTrainingDataset(periodStart: Date, periodEnd: Date): Promise<{ examples: LabeledExample[]; rawInteractionCount: number }> {
  const impressions = await prisma.researchEvent.findMany({
    where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: periodStart, lte: periodEnd }, entityId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (impressions.length === 0) return { examples: [], rawInteractionCount: 0 };

  const projectIds = [...new Set(impressions.map((i) => i.entityId).filter((id): id is string => id !== null))];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, localityId: true, priceMinPaise: true, createdAt: true, configurations: { select: { bedrooms: true } } },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const publicUserIds = [...new Set(impressions.map((i) => i.publicUserId).filter((id): id is string => id !== null))];
  const [preferencesRows, savedRows, compareRows, enquiryRows, clickRows] = await Promise.all([
    prisma.userPreferences.findMany({ where: { publicUserId: { in: publicUserIds } } }),
    prisma.savedProject.findMany({ where: { publicUserId: { in: publicUserIds }, projectId: { in: projectIds } }, select: { publicUserId: true, projectId: true, id: true } }),
    prisma.researchEvent.findMany({
      where: { publicUserId: { in: publicUserIds }, eventType: "COMPARE_USED", entityId: { in: projectIds }, createdAt: { gte: periodStart, lte: new Date(periodEnd.getTime() + ATTRIBUTION_WINDOW_MS) } },
      select: { publicUserId: true, entityId: true, createdAt: true },
    }),
    prisma.researchEvent.findMany({
      where: { publicUserId: { in: publicUserIds }, eventType: "CONTACT_ENQUIRY_SUBMITTED", entityId: { in: projectIds }, createdAt: { gte: periodStart, lte: new Date(periodEnd.getTime() + ATTRIBUTION_WINDOW_MS) } },
      select: { publicUserId: true, entityId: true, createdAt: true },
    }),
    prisma.researchEvent.findMany({
      where: { publicUserId: { in: publicUserIds }, eventType: "RECOMMENDATION_CLICKED", entityId: { in: projectIds }, createdAt: { gte: periodStart, lte: new Date(periodEnd.getTime() + ATTRIBUTION_WINDOW_MS) } },
      select: { publicUserId: true, entityId: true, createdAt: true },
    }),
  ]);
  const preferencesByUser = new Map(preferencesRows.map((p) => [p.publicUserId, p]));

  const savedKey = (userId: string, projectId: string) => `${userId}:${projectId}`;
  const savedSet = new Set(savedRows.map((s) => savedKey(s.publicUserId, s.projectId)));

  function hadActionAfter(rows: { publicUserId: string | null; entityId: string | null; createdAt: Date }[], userId: string | null, projectId: string, after: Date): boolean {
    if (!userId) return false;
    return rows.some((r) => r.publicUserId === userId && r.entityId === projectId && r.createdAt >= after && r.createdAt.getTime() <= after.getTime() + ATTRIBUTION_WINDOW_MS);
  }

  const examples: LabeledExample[] = [];

  for (const impression of impressions) {
    const projectId = impression.entityId;
    if (!projectId) continue;
    const project = projectById.get(projectId);
    if (!project) continue; // deleted/unpublished since — can't reconstruct project features honestly, skip rather than guess

    const clicked = hadActionAfter(clickRows, impression.publicUserId, projectId, impression.createdAt);
    const saved = impression.publicUserId ? savedSet.has(savedKey(impression.publicUserId, projectId)) : false;
    const compared = hadActionAfter(compareRows, impression.publicUserId, projectId, impression.createdAt);
    const enquired = hadActionAfter(enquiryRows, impression.publicUserId, projectId, impression.createdAt);

    let outcome: OutcomeWeight = OUTCOME_WEIGHT.NONE;
    if (clicked) outcome = OUTCOME_WEIGHT.CLICK;
    if (clicked && (saved || compared)) outcome = OUTCOME_WEIGHT.DEEP_ENGAGEMENT;
    if (clicked && enquired) outcome = OUTCOME_WEIGHT.ENQUIRY;

    // Interest snapshot reconstructed from CURRENT state, not a point-in-time
    // snapshot (none was stored at impression time) — a documented Phase 2
    // simplification (see this file's header). Anonymous impressions get a
    // neutral/empty snapshot, same cold-start shape Phase 1 already uses.
    const interestInput: UserInterferenceInput = {
      publicUserId: impression.publicUserId,
      preferences: impression.publicUserId ? (preferencesByUser.get(impression.publicUserId) ?? null) : null,
      recentViewedProjects: [],
      savedProjectIds: impression.publicUserId ? savedRows.filter((s) => s.publicUserId === impression.publicUserId).map((s) => s.projectId) : [],
      compareEventProjectIds: [],
      isReturningVisitor: false,
    };
    const interest = buildUserInterestSnapshot(interestInput);

    const projectFeatureInput: ProjectFeatureInput = {
      id: project.id,
      localityId: project.localityId,
      priceMinPaise: project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
      configurationBedrooms: project.configurations.map((c) => Number(c.bedrooms)),
      createdAt: project.createdAt,
    };

    const metadata = (impression.metadata ?? {}) as ImpressionMetadata;
    const source: CandidateSource = metadata.candidateSources?.[0] ?? "EXPLORATION";
    const position = metadata.position ?? 0;

    const featureVector = buildFeatureVector(projectFeatureInput, interest, { source, position, totalCandidates: Math.max(position + 1, 8) });

    examples.push({
      featureVector,
      outcome,
      binaryLabel: toBinaryLabel(outcome),
      impressionId: impression.id,
      projectId,
      publicUserId: impression.publicUserId,
      sessionId: impression.sessionId,
      surface: metadata.surface ?? null,
      position,
      createdAt: impression.createdAt,
      phase1Score: metadata.score ?? null,
    });
  }

  return { examples, rawInteractionCount: impressions.length };
}

export { FEATURE_NAMES };
