import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { getDiscoveryCoverageReport } from "@/lib/ingestion/discovery/coverageReport";

export const metadata: Metadata = { title: "Discovery Coverage — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function DiscoveryCoveragePage() {
  await requireAdminSession();
  const report = await getDiscoveryCoverageReport();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Discovery Coverage</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Where Mumbai-wide discovery has and hasn&apos;t reached yet, derived from every discovery candidate ever recorded. Not a live crawl status —
          re-run discovery from the Discovery page to change these numbers.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          {report.totalCandidates} candidates ever · {report.totalCuratedDevelopers} curated developers · {report.totalMumbaiLocalities} Mumbai localities
          {report.unresolvedDeveloperCandidates > 0 ? ` · ${report.unresolvedDeveloperCandidates} with an unresolved developer` : ""}
          {report.unresolvedLocalityCandidates > 0 ? ` · ${report.unresolvedLocalityCandidates} with an unresolved locality` : ""}
        </p>
      </div>

      {report.lowCoverageDevelopers.length > 0 ? (
        <div className="rounded-sm border border-warning/40 bg-warning/10 p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-warning">Low-coverage developers ({report.lowCoverageDevelopers.length})</p>
          <p className="mt-1 text-sm text-foreground">Curated, but discovery has never produced a single candidate for: {report.lowCoverageDevelopers.join(", ")}</p>
        </div>
      ) : null}

      {report.lowCoverageLocalities.length > 0 ? (
        <div className="rounded-sm border border-warning/40 bg-warning/10 p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-warning">Low-coverage localities ({report.lowCoverageLocalities.length})</p>
          <p className="mt-1 text-sm text-foreground">No discovery candidate has ever resolved to: {report.lowCoverageLocalities.join(", ")}</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">By developer</h2>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Developer</th>
                <th className="px-3 py-2 font-medium">Curated</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium text-right">Staged</th>
                <th className="px-3 py-2 font-medium text-right">Needs review</th>
                <th className="px-3 py-2 font-medium text-right">Excluded</th>
                <th className="px-3 py-2 font-medium text-right">Duplicate</th>
                <th className="px-3 py-2 font-medium text-right">In progress</th>
              </tr>
            </thead>
            <tbody>
              {report.developers.map((d) => (
                <tr key={d.domain ?? d.developerName} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-foreground">{d.developerName}</td>
                  <td className="px-3 py-2 text-muted">{d.isCurated ? "Yes" : "No"}</td>
                  <td className={`px-3 py-2 text-right font-mono ${d.totalCandidates === 0 ? "text-warning" : "text-foreground"}`}>{d.totalCandidates}</td>
                  <td className="px-3 py-2 text-right text-muted">{d.staged}</td>
                  <td className="px-3 py-2 text-right text-muted">{d.needsReview}</td>
                  <td className="px-3 py-2 text-right text-muted">{d.excluded}</td>
                  <td className="px-3 py-2 text-right text-muted">{d.rejectedDuplicate}</td>
                  <td className="px-3 py-2 text-right text-muted">{d.inProgress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">By locality</h2>
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[320px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Locality</th>
                <th className="px-3 py-2 font-medium text-right">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {report.localities.map((l) => (
                <tr key={l.localityName} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-foreground">{l.localityName}</td>
                  <td className={`px-3 py-2 text-right font-mono ${l.candidateCount === 0 ? "text-warning" : "text-foreground"}`}>{l.candidateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
