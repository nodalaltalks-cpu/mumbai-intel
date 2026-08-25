import "server-only";
import { prisma } from "@/lib/prisma";
import { computeChange, type AnalyticsPeriod, type PeriodChange } from "@/lib/analytics/period";
import type { CandidateSource } from "./types";

/**
 * Founder-facing recommendation intelligence (Analytics Upgrade Part 2,
 * Parts 16-31) — every function here aggregates the SAME
 * RECOMMENDATION_IMPRESSION/RECOMMENDATION_CLICKED ResearchEvent rows (plus
 * SavedProject/COMPARE_USED/CONTACT_ENQUIRY_SUBMITTED for downstream
 * correlation) that lib/recommendations/admin-queries.ts and
 * lib/recommendations/impressions.ts already write — no new event types, no
 * new tables. Uses the existing centralized date-period system
 * (lib/analytics/period.ts) instead of a hardcoded day count, per the
 * spec's explicit "use the existing centralized date-period system
 * everywhere."
 */

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // matches lib/recommendations/ml/dataset.ts's window — one shared convention for "how long after a recommendation is an action still attributable to it"

interface ImpressionMeta {
  surface?: string;
  candidateSources?: CandidateSource[];
}

/** One bounded pull of impressions + every downstream event type they can be correlated against, for a given period — shared by the funnel/summary/personalization functions below so they never each re-scan the same rows separately. */
async function loadImpressionCorrelationData(period: AnalyticsPeriod) {
  const impressions = await prisma.researchEvent.findMany({
    where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: period.since, lte: period.until }, entityId: { not: null } },
    select: { entityId: true, publicUserId: true, sessionId: true, createdAt: true, metadata: true },
  });
  if (impressions.length === 0) return { impressions: [], clicks: [], views: [], saves: [], compares: [], enquiries: [] };

  const projectIds = [...new Set(impressions.map((i) => i.entityId).filter((id): id is string => id !== null))];
  const subjectUserIds = [...new Set(impressions.map((i) => i.publicUserId).filter((id): id is string => id !== null))];
  const attributionEnd = new Date(period.until.getTime() + ATTRIBUTION_WINDOW_MS);

  const [clicks, views, saves, compares, enquiries] = await Promise.all([
    prisma.researchEvent.findMany({ where: { eventType: "RECOMMENDATION_CLICKED", entityId: { in: projectIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { entityId: true, publicUserId: true, sessionId: true, createdAt: true } }),
    prisma.researchEvent.findMany({ where: { eventType: "PROJECT_VIEWED", entityId: { in: projectIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { entityId: true, publicUserId: true, sessionId: true, createdAt: true } }),
    subjectUserIds.length ? prisma.savedProject.findMany({ where: { publicUserId: { in: subjectUserIds }, projectId: { in: projectIds } }, select: { publicUserId: true, projectId: true } }) : Promise.resolve([]),
    prisma.researchEvent.findMany({ where: { eventType: "COMPARE_USED", entityId: { in: projectIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { entityId: true, publicUserId: true, createdAt: true } }),
    prisma.researchEvent.findMany({ where: { eventType: "CONTACT_ENQUIRY_SUBMITTED", entityId: { in: projectIds }, createdAt: { gte: period.since, lte: attributionEnd } }, select: { entityId: true, publicUserId: true, createdAt: true } }),
  ]);

  return { impressions, clicks, views, saves, compares, enquiries };
}

function subjectKey(row: { publicUserId: string | null; sessionId?: string | null }): string {
  return row.publicUserId ?? row.sessionId ?? "anon";
}

/** True if `rows` has an entry for the same project+subject at/after `impressionAt` (recommendation attribution — same reasoning as ml/dataset.ts's hadActionAfter). */
function attributedTo(rows: { entityId: string | null; publicUserId: string | null; sessionId?: string | null; createdAt: Date }[], projectId: string, subject: string, impressionAt: Date): boolean {
  return rows.some((r) => r.entityId === projectId && subjectKey(r) === subject && r.createdAt >= impressionAt);
}

export interface RecommendationFunnel {
  shown: number;
  clicked: number;
  viewed: number;
  saved: number;
  compared: number;
  contacted: number;
}

export async function getRecommendationFunnel(period: AnalyticsPeriod): Promise<RecommendationFunnel> {
  const data = await loadImpressionCorrelationData(period);
  const savedKeys = new Set(data.saves.map((s) => `${s.publicUserId}:${s.projectId}`));

  let clicked = 0, viewed = 0, saved = 0, compared = 0, contacted = 0;
  for (const imp of data.impressions) {
    if (!imp.entityId) continue;
    const subject = subjectKey(imp);
    const wasClicked = attributedTo(data.clicks, imp.entityId, subject, imp.createdAt);
    if (wasClicked) clicked++;
    if (attributedTo(data.views, imp.entityId, subject, imp.createdAt)) viewed++;
    if (imp.publicUserId && savedKeys.has(`${imp.publicUserId}:${imp.entityId}`)) saved++;
    if (attributedTo(data.compares, imp.entityId, subject, imp.createdAt)) compared++;
    if (attributedTo(data.enquiries, imp.entityId, subject, imp.createdAt)) contacted++;
  }

  return { shown: data.impressions.length, clicked, viewed, saved, compared, contacted };
}

export interface FounderRecommendationSummary {
  status: "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL" | "NO_DATA";
  impressions: number;
  ctrPercent: number | null;
  saveRatePercent: number | null;
  compareRatePercent: number | null;
  enquiryRatePercent: number | null;
  ctrChange: PeriodChange | null;
}

const MIN_IMPRESSIONS_FOR_COMPARISON = 30; // below this, a period-over-period % swing is mostly noise -- matches the same order-of-magnitude threshold visitor-queries.ts already uses (MIN_SESSIONS_FOR_INSIGHT = 5) scaled up for a per-impression rate rather than a per-session one

export async function getFounderRecommendationSummary(period: AnalyticsPeriod): Promise<FounderRecommendationSummary> {
  const funnel = await getRecommendationFunnel(period);
  if (funnel.shown === 0) {
    return { status: "NO_DATA", impressions: 0, ctrPercent: null, saveRatePercent: null, compareRatePercent: null, enquiryRatePercent: null, ctrChange: null };
  }

  const ctrPercent = Math.round((funnel.clicked / funnel.shown) * 1000) / 10;
  const saveRatePercent = Math.round((funnel.saved / funnel.shown) * 1000) / 10;
  const compareRatePercent = Math.round((funnel.compared / funnel.shown) * 1000) / 10;
  const enquiryRatePercent = Math.round((funnel.contacted / funnel.shown) * 1000) / 10;

  let ctrChange: PeriodChange | null = null;
  if (funnel.shown >= MIN_IMPRESSIONS_FOR_COMPARISON) {
    const previousPeriod: AnalyticsPeriod = { ...period, since: period.previousSince, until: period.previousUntil };
    const previousFunnel = await getRecommendationFunnel(previousPeriod);
    if (previousFunnel.shown >= MIN_IMPRESSIONS_FOR_COMPARISON) {
      const previousCtr = Math.round((previousFunnel.clicked / previousFunnel.shown) * 1000) / 10;
      ctrChange = computeChange(ctrPercent, previousCtr);
    }
  }

  // Status: rule-based off real thresholds, never a fabricated judgment (Part 17/22).
  let status: FounderRecommendationSummary["status"] = "HEALTHY";
  if (funnel.shown < MIN_IMPRESSIONS_FOR_COMPARISON) status = "NO_DATA";
  else if (ctrPercent < 1) status = "CRITICAL";
  else if (ctrChange?.direction === "down" && (ctrChange.percent ?? 0) <= -20) status = "NEEDS_ATTENTION";

  return { status, impressions: funnel.shown, ctrPercent, saveRatePercent, compareRatePercent, enquiryRatePercent, ctrChange };
}

export interface TopRecommendedAttributes {
  topLocalities: { name: string; count: number }[];
  topConfigurations: { label: string; count: number }[];
  topPriceBandRupeesCr: { band: string; count: number }[];
}

/** Part 18 — what's actually being recommended, not just what's clicked. Reads the same impression rows, joined to Project for locality/configuration/price (a real, bounded join — capped by the period's impression volume). */
export async function getTopRecommendedAttributes(period: AnalyticsPeriod, limit = 5): Promise<TopRecommendedAttributes> {
  const impressions = await prisma.researchEvent.findMany({
    where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: period.since, lte: period.until }, entityId: { not: null } },
    select: { entityId: true },
    take: 5000,
  });
  const projectIds = [...new Set(impressions.map((i) => i.entityId).filter((id): id is string => id !== null))];
  if (projectIds.length === 0) return { topLocalities: [], topConfigurations: [], topPriceBandRupeesCr: [] };

  const impressionCountByProject = new Map<string, number>();
  for (const i of impressions) if (i.entityId) impressionCountByProject.set(i.entityId, (impressionCountByProject.get(i.entityId) ?? 0) + 1);

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, priceMinPaise: true, priceMaxPaise: true, locality: { select: { name: true } }, configurations: { select: { bedrooms: true } } },
  });

  const localityCounts = new Map<string, number>();
  const configCounts = new Map<string, number>();
  const priceBandCounts = new Map<string, number>();

  function priceBand(minPaise: bigint | null): string | null {
    if (minPaise === null) return null;
    const cr = Number(minPaise) / 100 / 1_00_00_000; // paise -> rupees -> crore
    if (cr < 1) return "Under ₹1 Cr";
    if (cr < 2) return "₹1–2 Cr";
    if (cr < 3) return "₹2–3 Cr";
    if (cr < 5) return "₹3–5 Cr";
    return "₹5 Cr+";
  }

  for (const p of projects) {
    const weight = impressionCountByProject.get(p.id) ?? 0;
    localityCounts.set(p.locality.name, (localityCounts.get(p.locality.name) ?? 0) + weight);
    for (const c of p.configurations) {
      const label = `${Math.floor(Number(c.bedrooms))} BHK`;
      configCounts.set(label, (configCounts.get(label) ?? 0) + weight);
    }
    const band = priceBand(p.priceMinPaise);
    if (band) priceBandCounts.set(band, (priceBandCounts.get(band) ?? 0) + weight);
  }

  const topN = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  return {
    topLocalities: topN(localityCounts).map(([name, count]) => ({ name, count })),
    topConfigurations: topN(configCounts).map(([label, count]) => ({ label, count })),
    topPriceBandRupeesCr: topN(priceBandCounts).map(([band, count]) => ({ band, count })),
  };
}

export type PersonalizationLevel = "COLD_START" | "PROFILE_BASED" | "PROFILE_AND_BEHAVIOR" | "SIMILARITY_BASED" | "EXPLORATION";

export interface PersonalizationDepth {
  coldStartPercent: number;
  profileBasedPercent: number;
  behaviorBasedPercent: number;
  explorationPercent: number;
  dominantLevel: PersonalizationLevel | null;
}

const SOURCE_TO_LEVEL: Record<CandidateSource, PersonalizationLevel> = {
  TRENDING: "COLD_START",
  NEW: "COLD_START",
  PROFILE_MATCH: "PROFILE_BASED",
  RECENT_BEHAVIOR: "PROFILE_AND_BEHAVIOR",
  SIMILAR_PROJECT: "SIMILARITY_BASED",
  EXPLORATION: "EXPLORATION",
};

/** Part 25/26 — coverage/personalization depth, read from the candidateSources already stored on every impression's metadata (no new tracking). */
export async function getPersonalizationDepth(period: AnalyticsPeriod): Promise<PersonalizationDepth> {
  const impressions = await prisma.researchEvent.findMany({
    where: { eventType: "RECOMMENDATION_IMPRESSION", createdAt: { gte: period.since, lte: period.until } },
    select: { metadata: true },
    take: 5000,
  });
  if (impressions.length === 0) return { coldStartPercent: 0, profileBasedPercent: 0, behaviorBasedPercent: 0, explorationPercent: 0, dominantLevel: null };

  const levelCounts: Record<PersonalizationLevel, number> = { COLD_START: 0, PROFILE_BASED: 0, PROFILE_AND_BEHAVIOR: 0, SIMILARITY_BASED: 0, EXPLORATION: 0 };
  for (const row of impressions) {
    const meta = (row.metadata ?? {}) as ImpressionMeta;
    const primarySource = meta.candidateSources?.[0];
    const level = primarySource ? SOURCE_TO_LEVEL[primarySource] : "COLD_START";
    levelCounts[level]++;
  }

  const total = impressions.length;
  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  const dominantLevel = (Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as PersonalizationLevel) ?? null;

  return {
    coldStartPercent: pct(levelCounts.COLD_START),
    profileBasedPercent: pct(levelCounts.PROFILE_BASED),
    behaviorBasedPercent: pct(levelCounts.PROFILE_AND_BEHAVIOR + levelCounts.SIMILARITY_BASED),
    explorationPercent: pct(levelCounts.EXPLORATION),
    dominantLevel,
  };
}

export interface DecisionInsight {
  text: string;
}

/**
 * Part 31 — "What should I do?" Every insight here is derived directly from
 * the real aggregates above (or getTopRecommendedAttributes/search-queries),
 * never generic advice. Deliberately small and conservative: an insight
 * only fires when the underlying number actually supports the claim (Part
 * 14/26's "do not fabricate statistical significance" applies here too,
 * even though this spec section didn't repeat it verbatim).
 */
export async function getRecommendationDecisionInsights(period: AnalyticsPeriod): Promise<DecisionInsight[]> {
  const [funnel, attributes, personalization] = await Promise.all([
    getRecommendationFunnel(period),
    getTopRecommendedAttributes(period),
    getPersonalizationDepth(period),
  ]);
  const insights: DecisionInsight[] = [];

  if (funnel.shown < MIN_IMPRESSIONS_FOR_COMPARISON) {
    insights.push({ text: `Not enough recommendation activity yet this period (${funnel.shown} shown) to generate reliable insights.` });
    return insights;
  }

  const topLocality = attributes.topLocalities[0];
  if (topLocality && attributes.topLocalities.length >= 1) {
    const localityShare = Math.round((topLocality.count / attributes.topLocalities.reduce((s, l) => s + l.count, 0)) * 100);
    if (localityShare >= 50) {
      insights.push({ text: `Recommendations are heavily concentrated in ${topLocality.name} (${localityShare}% of recommended impressions) — worth checking whether the catalog has enough variety elsewhere to diversify.` });
    }
  }

  if (personalization.coldStartPercent >= 70) {
    insights.push({ text: `${personalization.coldStartPercent}% of recommendations are still cold-start (trending/new, not personalized) — most visitors don't yet have enough tracked behavior for personalized ranking.` });
  } else if (personalization.dominantLevel) {
    const label = { COLD_START: "cold-start", PROFILE_BASED: "profile-based", PROFILE_AND_BEHAVIOR: "profile + behaviour", SIMILARITY_BASED: "similarity-based", EXPLORATION: "exploration" }[personalization.dominantLevel];
    insights.push({ text: `Most users are currently receiving ${label} recommendations.` });
  }

  if (funnel.clicked > 0 && funnel.saved === 0 && funnel.compared === 0 && funnel.contacted === 0) {
    insights.push({ text: `${funnel.clicked} recommendation click-throughs this period led to zero saves, compares, or enquiries — clicks are happening but not converting to deeper engagement.` });
  }

  return insights;
}
