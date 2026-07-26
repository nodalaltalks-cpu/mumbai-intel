import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import ChangePasswordForm from "@/app/admin/components/ChangePasswordForm";

export const metadata: Metadata = { title: "Settings — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="font-mono text-lg font-semibold text-foreground">Settings</h1>

      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-sm font-semibold text-foreground">Account</h2>
        <p className="mt-2 text-xs text-muted">Signed in as</p>
        <p className="font-mono text-sm text-foreground">{session.name ?? "Founder"} · {session.email}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-accent">{session.role}</p>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Change password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
