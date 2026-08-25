import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/guard";
import {
  getRecommendationOverview,
  getTopRecommendedProjects,
  getRecommendationSurfaceBreakdown,
  getRecentRecommendationImpressions,
} from "@/lib/recommendations/admin-queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Recommendation Intelligence — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function RecommendationIntelligencePage() {
  // Same gating as the rest of Analytics (any signed-in admin-side role) —
  // not infrastructure-sensitive the way Platform Health is, so not
  // ADMIN-only.
  await requireSession();

  const [overview, topProjects, surfaces, recent] = await Promise.all([
    getRecommendationOverview(30),
    getTopRecommendedProjects(30, 10),
    getRecommendationSurfaceBreakdown(30),
    getRecentRecommendationImpressions(25),
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
                  {formatDateTime(r.createdAt)} · {r.surface ?? "unknown surface"} · {r.isRegistered ? "registered" : "anonymous"}{r.score !== null ? ` · score ${r.score}` : ""}
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
