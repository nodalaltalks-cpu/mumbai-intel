import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { getUsersAdmin } from "@/lib/admin-queries";
import { deleteUserAction } from "@/lib/actions/users";
import { formatDate } from "@/lib/format";
import ConfirmButton from "@/app/admin/components/ConfirmButton";
import FlashMessage from "@/app/admin/components/FlashMessage";

export const metadata: Metadata = { title: "Users — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; saved?: string }>;
}) {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/admin");

  const params = await searchParams;
  const users = await getUsersAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Users</h1>
          <p className="text-xs text-muted">{users.length} total · admin-only</p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
        >
          New User
        </Link>
      </div>

      <FlashMessage type={params.created ? "created" : params.saved ? "saved" : null} />

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last login</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${user.id}/edit`} className="font-mono text-foreground hover:text-accent">
                    {user.email}
                  </Link>
                  {user.id === session.userId ? <span className="ml-1.5 text-[10px] text-muted">(you)</span> : null}
                </td>
                <td className="px-3 py-2 text-muted">{user.name ?? "--"}</td>
                <td className="px-3 py-2 font-mono text-muted">{user.role}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase ${user.isActive ? "border-positive/40 text-positive" : "border-border text-muted"}`}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{formatDate(user.lastLoginAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/users/${user.id}/edit`}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      Edit
                    </Link>
                    {user.id !== session.userId ? <ConfirmButton action={deleteUserAction.bind(null, user.id)} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
