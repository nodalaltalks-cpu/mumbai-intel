import { requireSession } from "@/lib/auth/guard";
import { getActivityFeed, getAdminNotifications } from "@/lib/admin-queries";
import AdminShell from "@/app/admin/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [activity, notifications] = await Promise.all([getActivityFeed(8), getAdminNotifications(session.userId)]);

  return (
    <div className="bg-background">
      <AdminShell session={session} activity={activity} notifications={notifications}>
        {children}
      </AdminShell>
    </div>
  );
}
