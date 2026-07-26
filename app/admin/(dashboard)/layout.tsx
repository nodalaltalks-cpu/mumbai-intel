import { requireSession } from "@/lib/auth/guard";
import { getActivityFeed } from "@/lib/admin-queries";
import AdminShell from "@/app/admin/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const activity = await getActivityFeed(8);

  return (
    <div className="bg-background">
      <AdminShell session={session} activity={activity}>
        {children}
      </AdminShell>
    </div>
  );
}
