import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { getUserForEdit, getUserActivity } from "@/lib/admin-queries";
import { formatDateTime } from "@/lib/format";
import UserEditForm from "@/app/admin/components/UserEditForm";
import BackButton from "@/app/admin/components/BackButton";

export const metadata: Metadata = { title: "Edit User — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/admin");

  const { id } = await params;
  const [user, activity] = await Promise.all([getUserForEdit(id), getUserActivity(id, 30)]);
  if (!user) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <BackButton fallbackHref="/admin/users" />
      <h1 className="font-mono text-lg font-semibold text-foreground">Edit User</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <UserEditForm user={user} isSelf={user.id === session.userId} />
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No recorded actions yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-t border-border pt-1.5 text-xs first:border-t-0 first:pt-0">
                <span className="font-mono text-foreground">{a.action}</span>
                <span className="text-[10px] text-muted">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
