import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/guard";
import { getActivityFeedFiltered, getActivityEntityTypes } from "@/lib/admin-queries";
import { ANALYTICS_PERIOD_COOKIE, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AuditHistory from "@/app/admin/components/AuditHistory";
import ActivityActorFilter from "@/app/admin/components/ActivityActorFilter";
import ActivityRetentionCard from "@/app/admin/components/ActivityRetentionCard";

export const metadata: Metadata = { title: "Activity — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * The full operational history the dashboard's Activity widget only teases
 * 12 rows of (Section 22) — every founder/employee mutation, filterable by
 * the same central date-period utility already used across Campaigns/
 * Analytics/Data Sync (Section 8), plus entity type and actor. Reuses
 * AuditHistory (already powering per-entity History panels) for row
 * rendering, so a mutation reads the same way everywhere it appears.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; entityType?: string; actorId?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [logs, entityTypes] = await Promise.all([
    getActivityFeedFiltered(
      { since: period.since, until: period.until, entityType: params.entityType || undefined, actorId: params.actorId || undefined },
      200
    ),
    getActivityEntityTypes(),
  ]);

  const actors = Array.from(new Map(logs.filter((l) => l.actor).map((l) => [l.actor!.id, l.actor!])).values());

  function filterHref(next: { entityType?: string; actorId?: string }) {
    const qs = new URLSearchParams();
    if (params.period) qs.set("period", params.period);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const entityType = "entityType" in next ? next.entityType : params.entityType;
    const actorId = "actorId" in next ? next.actorId : params.actorId;
    if (entityType) qs.set("entityType", entityType);
    if (actorId) qs.set("actorId", actorId);
    return `/admin/activity?${qs.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Activity</h1>
        <p className="text-xs text-muted">Every logged founder/employee action — project edits, transaction updates, approvals, sends, deletions, restores.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface p-3">
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={filterHref({ entityType: undefined })}
          className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
            !params.entityType ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
          }`}
        >
          All types
        </a>
        {entityTypes.map((type) => (
          <a
            key={type}
            href={filterHref({ entityType: type })}
            className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
              params.entityType === type ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
            }`}
          >
            {type}
          </a>
        ))}
        {actors.length > 0 ? (
          <ActivityActorFilter
            actors={actors}
            currentActorId={params.actorId}
            baseParams={{ period: params.period, from: params.from, to: params.to, entityType: params.entityType }}
          />
        ) : null}
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-muted">No activity for this period/filter.</p>
      ) : (
        <>
          <p className="text-[10px] text-muted">{logs.length} entr{logs.length === 1 ? "y" : "ies"}{logs.length === 200 ? " (showing most recent 200)" : ""}</p>
          <AuditHistory logs={logs} />
        </>
      )}

      {session.role === "ADMIN" ? <ActivityRetentionCard /> : null}
    </div>
  );
}
