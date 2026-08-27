"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fetchOlderPublicNotificationsAction, markPublicNotificationReadAction } from "@/lib/actions/notifications";
import { recordNotificationClickAction } from "@/lib/actions/notification-campaigns";
import { formatRelativeTime } from "@/lib/format";
import type { PublicNotificationItem } from "@/lib/queries/dashboard";

/** Same day-bucketing NotificationBell.tsx uses — kept identical rather than shared, since the two components' surrounding chrome (dropdown vs. inline page section) differ enough that extracting a shared component would touch NotificationBell's already-tested logic for no real benefit. */
function dayGroupLabel(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/**
 * Full notification history, rendered on its own page (app/notifications/page.tsx),
 * reached from the navbar bell's "View all" link. Reuses the exact same
 * Notification table / server actions NotificationBell.tsx already uses —
 * this is a second RENDERING of the same data, never a second notification
 * system. Strict per-user isolation is already enforced server-side in every
 * action this calls (recipientPublicUserId scoped to the signed-in session,
 * see lib/actions/notifications.ts).
 */
export default function NotificationHistorySection({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: PublicNotificationItem[];
  initialUnreadCount: number;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialNotifications.length >= 15);
  const [, startMarkRead] = useTransition();

  function loadMore() {
    if (notifications.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const oldest = notifications[notifications.length - 1];
    fetchOlderPublicNotificationsAction(oldest.createdAt.toString()).then((older) => {
      setNotifications((prev) => [...prev, ...older]);
      setHasMore(older.length >= 20);
      setLoadingMore(false);
    });
  }

  function openNotification(item: PublicNotificationItem) {
    if (!item.readAt) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      startMarkRead(() => void markPublicNotificationReadAction(item.id));
    }
    if (!item.clickedAt) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, clickedAt: new Date() } : n)));
      void recordNotificationClickAction(item.id);
    }
  }

  const groups: { label: string; items: PublicNotificationItem[] }[] = [];
  for (const item of notifications) {
    const label = dayGroupLabel(new Date(item.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <section id="notifications" className="scroll-mt-24 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-base font-semibold text-foreground">Notifications</h2>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">{unreadCount} unread</span>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No notifications yet — updates about your profile, saved searches, and research will show up here.</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="border-b border-border px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{group.label}</p>
              {group.items.map((item) => {
                const row = (
                  <div className="flex items-start gap-2.5 px-1 py-2.5">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-sm border border-border object-cover" />
                    ) : (
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-accent"}`} aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs ${item.readAt ? "text-muted" : "font-semibold text-foreground"}`}>{item.title}</p>
                      <p className={`mt-0.5 text-[11px] ${item.readAt ? "text-muted" : "text-foreground/80"}`}>{item.body}</p>
                      <p className="mt-1 text-[10px] text-muted">{formatRelativeTime(item.createdAt)}</p>
                    </div>
                  </div>
                );
                return item.actionUrl ? (
                  <Link key={item.id} href={item.actionUrl} onClick={() => openNotification(item)} className={`block border-b border-border last:border-b-0 hover:bg-accent/5 ${item.readAt ? "" : "bg-accent/5"}`}>
                    {row}
                  </Link>
                ) : (
                  <div key={item.id} role="button" tabIndex={0} onClick={() => openNotification(item)} className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/5 ${item.readAt ? "" : "bg-accent/5"}`}>
                    {row}
                  </div>
                );
              })}
            </div>
          ))}
          {hasMore ? (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-1 w-full rounded-sm border border-border py-2 text-center text-[11px] text-accent hover:bg-accent/5 disabled:opacity-60">
              {loadingMore ? "Loading…" : "Load older notifications"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
