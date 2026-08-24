import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getRegisteredUsersPage, getRegisteredUsersPeriodStats } from "@/lib/admin-queries";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";
import BackButton from "@/app/admin/components/BackButton";
import Pagination from "@/app/admin/components/Pagination";

export const metadata: Metadata = { title: "Registered Users — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const ACTIVITY_CLASS: Record<string, string> = {
  Daily: "border-positive/40 bg-positive/10 text-positive",
  Weekly: "border-accent/40 bg-accent/10 text-accent",
  Monthly: "border-border bg-surface-raised text-muted",
  Inactive: "border-negative/40 bg-negative/10 text-negative",
};

export default async function RegisteredUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; period?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!(await hasPermission(session, "users.view"))) redirect("/admin");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [{ items: users, total, totalPages }, periodStats] = await Promise.all([
    getRegisteredUsersPage(page, 20),
    getRegisteredUsersPeriodStats(period.since, period.until, period.previousSince, period.previousUntil),
  ]);
  const newUsersChange = computeChange(periodStats.newUsersInPeriod, periodStats.previousNewUsersInPeriod);

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (targetPage > 1) qs.set("page", String(targetPage));
    if (params.period) qs.set("period", params.period);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const query = qs.toString();
    return query ? `/admin/analytics/registered-users?${query}` : "/admin/analytics/registered-users";
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton fallbackHref="/admin" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Registered Users</h1>
          <p className="text-xs text-muted">
            {total} total (all time) · Activity is derived from ResearchEvent rows (project views, searches, compares, wishlist
            adds), same as the dashboard&apos;s DAU/WAU/MAU.
          </p>
        </div>
        <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <AnalyticsStatCard label="New Signups (period)" value={periodStats.newUsersInPeriod} previousValue={periodStats.previousNewUsersInPeriod} change={newUsersChange} />
        <AnalyticsStatCard label="Active Users (period)" value={periodStats.activeUsersInPeriod} />
        <AnalyticsStatCard label="Registered Users (all time)" value={total} />
      </div>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[820px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Signed up</th>
              <th className="px-3 py-2 font-medium">Verified</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium">Activity</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-3 py-2 font-mono text-foreground">
                  <Link href={`/admin/analytics/registered-users/${user.id}`} className="hover:text-accent hover:underline">
                    {user.email}
                  </Link>
                </td>
                <td className="px-3 py-2 text-foreground">{user.name ?? "--"}</td>
                <td className="px-3 py-2 text-foreground">{user.phone ?? "--"}</td>
                <td className="px-3 py-2 text-muted">{formatDate(user.createdAt)}</td>
                <td className="px-3 py-2">
                  {user.emailVerifiedAt ? (
                    <span className="rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[10px] text-positive">Yes</span>
                  ) : (
                    <span className="rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted">No</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">{user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : "Never"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${ACTIVITY_CLASS[user.activity]}`}>{user.activity}</span>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No registered users yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
    </div>
  );
}
