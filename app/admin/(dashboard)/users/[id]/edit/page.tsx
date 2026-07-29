import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { getUserForEdit } from "@/lib/admin-queries";
import UserEditForm from "@/app/admin/components/UserEditForm";

export const metadata: Metadata = { title: "Edit User — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/admin");

  const { id } = await params;
  const user = await getUserForEdit(id);
  if (!user) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="font-mono text-lg font-semibold text-foreground">Edit User</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <UserEditForm user={user} isSelf={user.id === session.userId} />
      </div>
    </div>
  );
}
