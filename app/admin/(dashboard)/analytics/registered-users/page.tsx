import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getRegisteredUsersPage } from "@/lib/admin-queries";
import { formatDate, formatRelativeTime } from "@/lib/format";
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
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const { items: users, total, totalPages } = await getRegisteredUsersPage(page, 20);

  function buildHref(targetPage: number) {
    return targetPage > 1 ? `/admin/analytics/registered-users?page=${targetPage}` : "/admin/analytics/registered-users";
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton fallbackHref="/admin" />

      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Registered Users</h1>
        <p className="text-xs text-muted">
          {total} total · Activity is derived from ResearchEvent rows (project views, searches, compares, wishlist
          adds), same as the dashboard&apos;s DAU/WAU/MAU.
        </p>
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
              <tr key={user.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-3 py-2 font-mono text-foreground">{user.email}</td>
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
