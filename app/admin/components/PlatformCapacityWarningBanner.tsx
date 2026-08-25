import { prisma } from "@/lib/prisma";
import DismissCapacityWarningButton from "./DismissCapacityWarningButton";

/**
 * Parts 9/10 — an obvious, Founder-only warning that appears platform-wide
 * in Admin (not just on Platform Health) when a capacity alert hasn't been
 * seen yet. Suppression/cooldown is inherited for free from
 * lib/platform-metrics/alerts.ts's once-per-day-per-level dedup — this
 * banner only ever has at most one unread alert to show at a time, and
 * "unread" (not "resolved") is what makes it stop reappearing once seen.
 */
export default async function PlatformCapacityWarningBanner({ adminUserId }: { adminUserId: string }) {
  const alert = await prisma.notification.findFirst({
    where: { type: "ADMIN_PLATFORM_CAPACITY_WARNING", recipientAdminUserId: adminUserId, readAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!alert) return null;

  const isCritical = alert.title.startsWith("Critical");

  return (
    <div className={`mx-4 mt-4 flex items-start justify-between gap-3 rounded-sm border p-3 ${isCritical ? "border-negative/50 bg-negative/10" : "border-warning/50 bg-warning/10"}`}>
      <div>
        <p className={`font-mono text-xs font-semibold uppercase tracking-wide ${isCritical ? "text-negative" : "text-warning"}`}>
          {isCritical ? "🚨 Critical Platform Load" : "⚠ Platform Capacity Warning"}
        </p>
        <p className="mt-1 text-xs text-foreground">{alert.body}</p>
        <a href="/admin/platform-health" className="mt-1 inline-block text-[11px] font-mono uppercase tracking-wide text-accent hover:underline">
          View Platform Health &rarr;
        </a>
      </div>
      <DismissCapacityWarningButton notificationId={alert.id} />
    </div>
  );
}
