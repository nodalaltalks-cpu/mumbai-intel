import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import UserForm from "@/app/admin/components/UserForm";
import BackButton from "@/app/admin/components/BackButton";

export const metadata: Metadata = { title: "New User — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/admin");

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <BackButton fallbackHref="/admin/users" />
      <h1 className="font-mono text-lg font-semibold text-foreground">New User</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <UserForm />
      </div>
    </div>
  );
}
