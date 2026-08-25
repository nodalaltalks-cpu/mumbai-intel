import { requireSession } from "@/lib/auth/guard";
import { getActivityFeed, getAdminNotifications } from "@/lib/admin-queries";
import AdminShell from "@/app/admin/components/AdminShell";
import PlatformCapacityWarningBanner from "@/app/admin/components/PlatformCapacityWarningBanner";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [activity, notifications] = await Promise.all([getActivityFeed(8), getAdminNotifications(session.userId)]);

  return (
    <div className="bg-background">
      <AdminShell session={session} activity={activity} notifications={notifications}>
        {/* Founder-only (Part 9/10) — EDITOR/VIEWER never see infrastructure warnings. */}
        {session.role === "ADMIN" ? <PlatformCapacityWarningBanner adminUserId={session.userId} /> : null}
        {children}
      </AdminShell>
    </div>
  );
}
