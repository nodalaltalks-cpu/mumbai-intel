import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getSiteSettings } from "@/lib/site-settings";
import { hasTrashPassword } from "@/lib/actions/trash-auth";
import ChangePasswordForm from "@/app/admin/components/ChangePasswordForm";
import ChangeTrashPasswordForm from "@/app/admin/components/ChangeTrashPasswordForm";
import SiteSettingsForm from "@/app/admin/components/SiteSettingsForm";
import CacheManagementCard from "@/app/admin/components/CacheManagementCard";

export const metadata: Metadata = { title: "Settings — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const settings = await getSiteSettings(["review_google_url", "review_appstore_url"]);
  const trashPasswordSet = session.role === "ADMIN" ? await hasTrashPassword(session.userId) : false;

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

      {session.role === "ADMIN" && trashPasswordSet ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Change Trash password</h2>
          <p className="mb-3 text-xs text-muted">Separate from your login password — required every time you open Trash.</p>
          <ChangeTrashPasswordForm />
        </div>
      ) : null}

      {session.role === "ADMIN" ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-sm font-semibold text-foreground">Review destinations</h2>
          <p className="mt-1 text-xs text-muted">
            Shown to a user after their reported issue is resolved, inviting feedback — optional, leave blank to skip.
          </p>
          <div className="mt-3">
            <SiteSettingsForm googleUrl={settings.review_google_url ?? ""} appStoreUrl={settings.review_appstore_url ?? ""} />
          </div>
        </div>
      ) : null}

      {session.role === "ADMIN" ? <CacheManagementCard /> : null}
    </div>
  );
}
