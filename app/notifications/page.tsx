import type { Metadata } from "next";
import { requirePublicSession } from "@/lib/public-auth/guard";
import { getPublicNotifications, getPublicUnreadNotificationCount } from "@/lib/queries/dashboard";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import NotificationHistorySection from "@/app/account/NotificationHistorySection";

export const metadata: Metadata = { title: "Notifications - NoDalalTalks" };
export const dynamic = "force-dynamic";

/**
 * Full notification history, reached from the navbar bell -- moved here from
 * the profile-completion tab (which now stays focused on filling in the
 * profile). Reuses the exact same NotificationHistorySection component and
 * Notification queries/actions the bell dropdown and the old profile-page
 * section both already used -- no second notification system, no duplicate
 * table, no new data model.
 */
export default async function NotificationsPage() {
  const session = await requirePublicSession("/notifications");
  const [notifications, unreadCount] = await Promise.all([
    getPublicNotifications(session.userId),
    getPublicUnreadNotificationCount(session.userId),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="mb-4 font-mono text-lg font-semibold text-foreground">Notifications</h1>
        <NotificationHistorySection initialNotifications={notifications} initialUnreadCount={unreadCount} />
      </main>
      <Footer />
    </div>
  );
}
