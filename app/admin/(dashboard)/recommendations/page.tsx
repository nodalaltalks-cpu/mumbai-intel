import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/guard";
import {
  getRecommendationOverview,
  getTopRecommendedProjects,
  getRecommendationSurfaceBreakdown,
  getRecentRecommendationImpressions,
} from "@/lib/recommendations/admin-queries";
import { getRecommendationDataAudit } from "@/lib/recommendations/ml/audit";
import { getMlDashboardData, checkModelPerformanceDrift } from "@/lib/recommendations/ml/admin-queries";
import { SUFFICIENCY_THRESHOLDS } from "@/lib/recommendations/ml/train";
import { formatDateTime } from "@/lib/format";
import MlControls from "@/app/admin/components/MlControls";
import ModelStatusButton from "@/app/admin/components/ModelStatusButton";

export const metadata: Metadata = { title: "Recommendation Intelligence — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const MODEL_STATUS_CLASS: Record<string, string> = {
  INSUFFICIENT_DATA: "border-warning/40 bg-warning/10 text-warning",
  TRAINING: "border-info/40 bg-info/10 text-info",
  EVALUATED: "border-border bg-surface-raised text-muted",
  SHADOW: "border-info/40 bg-info/10 text-info",
  ACTIVE: "border-positive/40 bg-positive/10 text-positive",
  ARCHIVED: "border-border bg-surface-raised text-muted",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

export default async function RecommendationIntelligencePage() {
  // Same gating as the rest of Analytics (any signed-in admin-side role) —
  // not infrastructure-sensitive the way Platform Health is, so not
  // ADMIN-only for VIEWING. Mutating actions (train/mode/promote) are each
  // independently gated requireAdminSession() in lib/actions/recommendation-ml.ts.
  const session = await requireSession();

  const [overview, topProjects, surfaces, recent, dataAudit, ml, drift] = await Promise.all([
    getRecommendationOverview(30),
    getTopRecommendedProjects(30, 10),
    getRecommendationSurfaceBreakdown(30),
    getRecentRecommendationImpressions(25),
    getRecommendationDataAudit(),
    getMlDashboardData(),
    checkModelPerformanceDrift(),
  ]);

  const coveragePercent = overview.publishedProjectCount > 0 ? Math.round((overview.distinctProjectsRecommended / overview.publishedProjectCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Recommendation Intelligence</h1>
        <p className="text-xs text-muted">
          Real aggregates over RECOMMENDATION_IMPRESSION/RECOMMENDATION_CLICKED events — Phase 1 (rules + weighted scoring, no ML yet). Last 30 days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Recommendations served</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{overview.totalImpressions.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Click-through rate</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{overview.ctrPercent !== null ? `${overview.ctrPercent}%` : "--"}</p>
          <p className="mt-1 text-[11px] text-muted">{overview.totalClicks.toLocaleString("en-IN")} click-throughs</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Coverage</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{coveragePercent}%</p>
          <p className="mt-1 text-[11px] text-muted">{overview.distinctProjectsRecommended} of {overview.publishedProjectCount} published projects shown</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Recommendation health</p>
          <p className={`mt-1.5 font-mono text-lg font-semibold ${overview.totalImpressions === 0 ? "text-muted" : overview.ctrPercent !== null && overview.ctrPercent < 1 ? "text-warning" : "text-positive"}`}>
            {overview.totalImpressions === 0 ? "No data yet" : overview.ctrPercent !== null && overview.ctrPercent < 1 ? "NEEDS ATTENTION" : "HEALTHY"}
          </p>
        </div>
      </div>

      {drift?.degraded ? (
        <div className="rounded-sm border border-negative/50 bg-negative/10 p-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-negative">Recommendation Engine Warning</p>
          <p className="mt-1 text-xs text-foreground">{drift.message}</p>
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Machine Learning (Phase 2)</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Current model</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">{ml.currentModel ? ml.currentModel.version : "Phase 1 only"}</p>
            {ml.currentModel ? (
              <span className={`mt-1 inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${MODEL_STATUS_CLASS[ml.currentModel.status]}`}>
                {ml.currentModel.status}
              </span>
            ) : (
              <p className="mt-1 text-[11px] text-muted">No model has been trained yet.</p>
            )}
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Production ranker</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">
              {ml.rankingMode === "ML_ENABLED" ? "ML (with Phase 1 fallback)" : "Phase 1 (deterministic)"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Mode: {ml.rankingMode}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">Retraining</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">{ml.retraining.needed ? "Recommended" : "Not yet needed"}</p>
            <p className="mt-1 text-[11px] text-muted">{ml.retraining.newInteractionsSinceLastTrain} new impressions since last training run</p>
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Training data available (Part 2 audit)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-[10px] text-muted">Recommendation impressions</p><p className="font-mono text-base text-foreground">{dataAudit.recommendation.impressions}</p></div>
          <div><p className="text-[10px] text-muted">Recommendation clicks</p><p className="font-mono text-base text-foreground">{dataAudit.recommendation.clicks}</p></div>
          <div><p className="text-[10px] text-muted">Distinct projects recommended</p><p className="font-mono text-base text-foreground">{dataAudit.recommendation.distinctProjectsRecommended}</p></div>
          <div><p className="text-[10px] text-muted">Distinct users/sessions served</p><p className="font-mono text-base text-foreground">{dataAudit.recommendation.distinctSubjectsServed}</p></div>
          <div><p className="text-[10px] text-muted">Published catalog size</p><p className="font-mono text-base text-foreground">{dataAudit.catalog.publishedProjects}</p></div>
          <div><p className="text-[10px] text-muted">Registered users w/ preferences</p><p className="font-mono text-base text-foreground">{dataAudit.userProfile.usersWithPreferences}</p></div>
          <div><p className="text-[10px] text-muted">Saved projects</p><p className="font-mono text-base text-foreground">{dataAudit.behavioral.savedProjects}</p></div>
          <div><p className="text-[10px] text-muted">Compares</p><p className="font-mono text-base text-foreground">{dataAudit.behavioral.compares}</p></div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Training requires at least {SUFFICIENCY_THRESHOLDS.minLabeledExamples} labeled impressions, {SUFFICIENCY_THRESHOLDS.minPositiveExamples} clicked, across {SUFFICIENCY_THRESHOLDS.minDistinctProjects}+ distinct projects and {SUFFICIENCY_THRESHOLDS.minDistinctSubjects}+ distinct users/sessions (see lib/recommendations/ml/train.ts for the reasoning). Below this, training deliberately reports INSUFFICIENT_DATA rather than fitting noise.
        </p>
      </section>

      {session.role === "ADMIN" ? <MlControls currentMode={ml.rankingMode} /> : null}

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Model version history</h2>
        {ml.history.length === 0 ? (
          <p className="text-xs text-muted">No training runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Trained</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Dataset size</th>
                  <th className="px-3 py-2 font-medium">ML vs Phase 1 (holdout CTR)</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  {session.role === "ADMIN" ? <th className="px-3 py-2 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {ml.history.map((v) => {
                  const metrics = v.metricsJson as { holdout?: { ml?: { ctr?: number | null }; phase1?: { ctr?: number | null } } } | null;
                  const mlCtr = metrics?.holdout?.ml?.ctr;
                  const phase1Ctr = metrics?.holdout?.phase1?.ctr;
                  return (
                    <tr key={v.id} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-3 py-2 font-mono text-foreground">{v.version}</td>
                      <td className="px-3 py-2 text-muted">{formatDateTime(v.trainedAt)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase ${MODEL_STATUS_CLASS[v.status]}`}>{v.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{v.datasetSize}</td>
                      <td className="px-3 py-2 text-muted">
                        {typeof mlCtr === "number" && typeof phase1Ctr === "number" ? `ML ${(mlCtr * 100).toFixed(1)}% vs Phase 1 ${(phase1Ctr * 100).toFixed(1)}%` : "--"}
                      </td>
                      <td className="px-3 py-2 text-muted">{v.notes ?? "--"}</td>
                      {session.role === "ADMIN" ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {v.status === "EVALUATED" ? <ModelStatusButton modelVersionId={v.id} targetStatus="SHADOW" label="Move to Shadow" /> : null}
                            {v.status === "SHADOW" ? <ModelStatusButton modelVersionId={v.id} targetStatus="ACTIVE" label="Promote to Active" /> : null}
                            {(v.status === "SHADOW" || v.status === "ACTIVE") ? <ModelStatusButton modelVersionId={v.id} targetStatus="ARCHIVED" label="Archive" /> : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">By surface</h2>
        {surfaces.length === 0 ? (
          <p className="text-xs text-muted">No impressions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Surface</th>
                  <th className="px-3 py-2 font-medium text-right">Impressions</th>
                  <th className="px-3 py-2 font-medium text-right">Clicks</th>
                  <th className="px-3 py-2 font-medium text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map((s) => (
                  <tr key={s.surface} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-foreground">{s.surface}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{s.impressions}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{s.clicks}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{s.impressions > 0 ? `${Math.round((s.clicks / s.impressions) * 1000) / 10}%` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Top recommended projects</h2>
        {topProjects.length === 0 ? (
          <p className="text-xs text-muted">No impressions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium text-right">Impressions</th>
                  <th className="px-3 py-2 font-medium text-right">Clicks</th>
                  <th className="px-3 py-2 font-medium text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map((p) => (
                  <tr key={p.projectId} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-foreground">
                      {p.projectSlug ? <Link href={`/projects/${p.projectSlug}`} className="hover:text-accent">{p.projectName ?? p.projectId}</Link> : (p.projectName ?? p.projectId)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{p.impressions}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{p.clicks}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{p.impressions > 0 ? `${Math.round((p.clicks / p.impressions) * 1000) / 10}%` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Recent recommendations (why was this shown?)</h2>
        <p className="mb-3 text-[11px] text-muted">Part 30 debug view — the last 25 impressions with their scoring reasons. A full per-user drill-down is a Phase 3 follow-up (see final report).</p>
        {recent.length === 0 ? (
          <p className="text-xs text-muted">No impressions recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.id} className="border-b border-border pb-2 text-xs last:border-b-0">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {formatDateTime(r.createdAt)} · {r.surface ?? "unknown surface"} · {r.isRegistered ? "registered" : "anonymous"}{r.score !== null ? ` · Phase 1 score ${r.score}` : ""}
                  {r.mlScore !== null ? ` · ML score ${r.mlScore} (${r.mlModelVersion})` : ""}
                </p>
                <p className="font-semibold text-foreground">{r.projectName ?? "Unknown project"}</p>
                <p className="text-muted">{r.reasons.join(" · ") || "No reason recorded"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
