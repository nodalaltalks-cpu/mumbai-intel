import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import {
  COMPLETION_BUCKETS,
  getCompletionDistribution,
  getFieldCompletionRates,
  getProfileCompletionSummary,
  getUsersByCompletionBucket,
  type CompletionBucketKey,
} from "@/lib/analytics/profile-completion-queries";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Profile Completion — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function isBucketKey(value: string | undefined): value is CompletionBucketKey {
  return COMPLETION_BUCKETS.some((b) => b.key === value);
}

export default async function ProfileCompletionAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const session = await requireSession();
  if (!(await hasPermission(session, "users.view_activity"))) redirect("/admin");
  const sp = await searchParams;
  const bucket = isBucketKey(sp.bucket) ? sp.bucket : undefined;

  const [summary, distribution, users, fieldRates] = await Promise.all([
    getProfileCompletionSummary(),
    getCompletionDistribution(),
    getUsersByCompletionBucket(bucket),
    getFieldCompletionRates(),
  ]);

  const maxBucketCount = Math.max(...distribution.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Profile Completion</h1>
          <p className="text-xs text-muted">
            Live from every PublicUser row — a current-state snapshot of every account&apos;s completion right now, not a
            period metric, so it intentionally doesn&apos;t carry the Day/Week/Month/... filter used elsewhere in Analytics —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total Users", summary.totalUsers],
          ["Completed (100%)", summary.completedProfiles],
          ["Incomplete", summary.incompleteProfiles],
          ["Average Completion", `${summary.averageCompletionPercent}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-sm border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Completion Distribution</h2>
        <div className="flex flex-col gap-2">
          {distribution.map((b) => (
            <Link
              key={b.key}
              href={bucket === b.key ? "/admin/analytics/profile-completion" : `/admin/analytics/profile-completion?bucket=${b.key}`}
              className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 transition-colors ${
                bucket === b.key ? "border-accent bg-accent/10" : "border-transparent hover:border-border"
              }`}
            >
              <span className="w-16 shrink-0 font-mono text-xs text-foreground">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(b.count / maxBucketCount) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-xs text-muted">{b.count}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Field Completion Rates</h2>
        <p className="mb-3 text-[11px] text-muted">
          Which fields users actually fill in, most-completed first — the fields near the bottom are where the profile flow is
          creating the most friction. Skip counts come from real PROFILE_FIELD_SKIPPED events.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-3 font-medium">Field</th>
                <th className="py-1.5 pr-3 font-medium">Completion</th>
                <th className="py-1.5 pr-3 font-medium">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {fieldRates.map((f) => (
                <tr key={f.key} className="border-b border-border last:border-b-0">
                  <td className="py-1.5 pr-3 font-mono text-foreground">{f.label}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-background">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${f.completionRate}%` }} />
                      </div>
                      <span className="font-mono text-accent">{f.completionRate}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{f.skippedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">
            Users {bucket ? `— ${COMPLETION_BUCKETS.find((b) => b.key === bucket)?.label}` : ""}
          </h2>
          {bucket ? (
            <Link href="/admin/analytics/profile-completion" className="text-[11px] text-muted hover:text-accent">
              Clear filter
            </Link>
          ) : null}
        </div>
        {users.length === 0 ? (
          <p className="text-xs text-muted">No users match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Name</th>
                  <th className="py-1.5 pr-3 font-medium">Email</th>
                  <th className="py-1.5 pr-3 font-medium">Completion</th>
                  <th className="py-1.5 pr-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="py-1.5 pr-3 font-mono text-foreground">
                      <Link href={`/admin/analytics/registered-users/${u.id}`} className="hover:text-accent hover:underline">
                        {u.name ?? "--"}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{u.email}</td>
                    <td className="py-1.5 pr-3 font-mono text-accent">{u.profileCompletionPercent}%</td>
                    <td className="py-1.5 pr-3 text-muted">{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
