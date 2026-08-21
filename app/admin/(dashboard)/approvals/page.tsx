import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { getPendingChanges } from "@/lib/admin-queries";
import { formatDateTime } from "@/lib/format";
import PendingChangeActions from "@/app/admin/components/PendingChangeActions";

export const metadata: Metadata = { title: "Approvals — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "report.reject": "Reject report",
};

function describeChange(action: string, after: unknown): string {
  if (action === "report.reject") {
    const remark = (after as { remark?: string } | null)?.remark;
    return remark ? `Reason: "${remark}"` : "";
  }
  return after ? JSON.stringify(after) : "";
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/admin");

  const sp = await searchParams;
  const status = sp.status === "APPROVED" || sp.status === "REJECTED" ? sp.status : "PENDING";
  const changes = await getPendingChanges(status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Approvals</h1>
        <p className="text-xs text-muted">
          Sensitive actions submitted by an Editor wait here until you approve or reject them — nothing here has taken effect yet. Once you
          create employee accounts, their gated actions (starting with report rejections) will show up here.
        </p>
      </div>

      <div className="flex gap-1.5">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <a
            key={s}
            href={`/admin/approvals?status=${s}`}
            className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
              status === s ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
            }`}
          >
            {s}
          </a>
        ))}
      </div>

      {changes.length === 0 ? (
        <p className="text-xs text-muted">Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {changes.map((change) => (
            <div key={change.id} className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-accent/30 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-accent">
                    {ACTION_LABEL[change.action] ?? change.action}
                  </span>
                  <span className="text-[10px] text-muted">{formatDateTime(change.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-xs text-foreground">
                  {change.actor.name ?? change.actor.email} · {change.entityType}
                  {change.entityId ? ` #${change.entityId.slice(0, 8)}` : ""}
                </p>
                {describeChange(change.action, change.after) ? (
                  <p className="mt-1 text-xs text-muted">{describeChange(change.action, change.after)}</p>
                ) : null}
                {change.status !== "PENDING" ? (
                  <p className="mt-1.5 text-[10px] text-muted">
                    {change.status === "APPROVED" ? "Approved" : "Rejected"} by {change.reviewer?.name ?? change.reviewer?.email ?? "—"}
                    {change.reviewedAt ? ` · ${formatDateTime(change.reviewedAt)}` : ""}
                    {change.reviewNote ? ` · "${change.reviewNote}"` : ""}
                  </p>
                ) : null}
              </div>
              {change.status === "PENDING" ? (
                <div className="shrink-0">
                  <PendingChangeActions id={change.id} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
