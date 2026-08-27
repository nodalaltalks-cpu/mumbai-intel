"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchOlderPublicNotificationsAction, markPublicNotificationReadAction, fetchPublicNotificationsAction } from "@/lib/actions/notifications";
import { recordNotificationClickAction } from "@/lib/actions/notification-campaigns";
import { formatRelativeTime } from "@/lib/format";
import type { PublicNotificationItem } from "@/lib/queries/dashboard";

/**
 * How often to poll for new notifications while the visitor is on-page.
 * Tightened from the previous 30s — still plain interval polling, not a
 * websocket/SSE channel (none exists in this stack, and Vercel's serverless
 * model makes a persistent push connection materially more infrastructure
 * than a bell badge justifies). Paired with the visibilitychange listener
 * below, which refetches immediately when the visitor returns to the tab,
 * so the *typical* case (switch away, get a notification, switch back)
 * feels instant rather than waiting out a poll cycle — "smallest reliable
 * mechanism," not aggressive polling.
 */
const POLL_INTERVAL_MS = 12_000;

/** "Today" / "Yesterday" / an actual date — the grouping headers Section 4's example shows, computed from local calendar days, not a fixed 24h window (so 11pm and 1am the same night don't both read "Today" relative to now). */
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
 * Public-facing equivalent of AdminTopbar's "Reports" bell — same Notification
 * table, same read/unread pattern, just scoped to the signed-in visitor's own
 * notifications. Polls periodically (Section 8) so a new notification shows
 * up without the visitor needing to refresh the page. Grouped by day with a
 * "Load older" step (Section 3/4) — "one place where users can see
 * everything they have been notified about" — without introducing a second
 * notification list/page or a new data model.
 */
export default function NotificationBell({
  notifications: initialNotifications,
  initialUnreadCount,
}: {
  notifications: PublicNotificationItem[];
  initialUnreadCount: number;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  // Real total, not notifications.filter(n => !n.readAt).length — that list is capped,
  // so its unread count silently undercounts once a visitor has more unread than the cap.
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialNotifications.length >= 15);
  const [, startMarkRead] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const refresh = useCallback(() => {
    fetchPublicNotificationsAction().then((snapshot) => {
      setNotifications((prev) => {
        // Preserve any older pages already loaded via "Load more" -- a poll
        // refresh only ever replaces the newest window with its latest state,
        // then keeps whatever the visitor already scrolled into that's
        // strictly older than that window, never truncating their history.
        if (snapshot.items.length === 0) return prev;
        const cutoff = new Date(snapshot.items[snapshot.items.length - 1].createdAt).getTime();
        const olderTail = prev.filter((n) => new Date(n.createdAt).getTime() < cutoff);
        return [...snapshot.items, ...olderTail];
      });
      setUnreadCount(snapshot.unreadCount);
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

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

  function readNotification(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    startMarkRead(() => {
      void markPublicNotificationReadAction(id);
    });
  }

  /**
   * Tapping the notification itself (not just its optional action button) IS
   * the click, for CTR purposes — this was the actual bug: previously only
   * the action-button Link called recordNotificationClickAction, so any
   * notification without actionLabel/actionUrl (most of them; it's optional)
   * could never register a click no matter how many users opened it, and
   * admin CTR silently sat at 0% for those. clickedAt/NOTIFICATION_CLICKED
   * themselves are unchanged and already correctly read by both admin CTR
   * queries — the bug was purely that this call site never fired them.
   */
  function clickNotification(item: PublicNotificationItem) {
    if (!item.readAt) readNotification(item.id);
    if (!item.clickedAt) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, clickedAt: new Date() } : n)));
      void recordNotificationClickAction(item.id);
    }
  }

  function handleActionClick(item: PublicNotificationItem, event: React.MouseEvent) {
    event.stopPropagation();
    clickNotification(item);
  }

  // Group the flat, already-newest-first list into Today/Yesterday/older
  // buckets purely for display -- the underlying data and order are untouched.
  const groups: { label: string; items: PublicNotificationItem[] }[] = [];
  for (const item of notifications) {
    const label = dayGroupLabel(new Date(item.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div ref={boxRef} className="relative">
      {/* Part 6 — a larger, visually stronger bell (44px hit area, the standard
          mobile-tap-target minimum) with a permanent subtle accent tint rather
          than only-on-hover, so the affordance reads as "clickable" at a
          glance, not just on interaction. Pure styling change — polling,
          click tracking, and read/unread logic below are all untouched. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
          unreadCount > 0
            ? "border-accent/50 bg-accent/10 text-accent hover:border-accent hover:bg-accent/15"
            : "border-border bg-surface-raised text-foreground hover:border-accent hover:bg-accent/5"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
          <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-background bg-accent px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mi-pop-in absolute right-0 top-full z-50 mt-2 w-80 origin-top-right overflow-hidden rounded-sm border border-border bg-surface shadow-2xl sm:w-96">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Notifications</p>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">No notifications yet.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p className="sticky top-0 border-b border-border bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => clickNotification(item)}
                      className={`cursor-pointer border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-accent/5 ${item.readAt ? "" : "bg-accent/5"}`}
                    >
                      <div className="flex items-start gap-2">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-sm border border-border object-cover" />
                        ) : (
                          <span
                            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-accent"}`}
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs ${item.readAt ? "text-muted" : "font-semibold text-foreground"}`}>{item.title}</p>
                          <p className={`mt-0.5 text-[11px] ${item.readAt ? "text-muted" : "text-foreground/80"}`}>{item.body}</p>
                          <p className="mt-1 text-[10px] text-muted">{formatRelativeTime(item.createdAt)}</p>
                          {item.actionLabel && item.actionUrl ? (
                            <Link
                              href={item.actionUrl}
                              onClick={(e) => handleActionClick(item, e)}
                              className="mt-1.5 inline-block rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
                            >
                              {item.actionLabel}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
            {notifications.length > 0 && hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full border-b border-border px-3 py-2 text-center text-[11px] text-accent hover:bg-accent/5 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load older notifications"}
              </button>
            ) : null}
          </div>
          <div className="border-t border-border px-3 py-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-[10px] text-accent hover:underline">
              View all →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
