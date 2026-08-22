"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { markNotificationReadAction } from "@/lib/actions/notifications";
import type { SessionPayload } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  at: Date;
  actor: { name: string | null; email: string } | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

// Builder/Locality dropped from Quick Add, the Catalog sidebar, and the command palette --
// Project creation already has inline "+ New Builder"/"+ New Locality" (find-or-create), so a
// separate top-level shortcut just duplicated that workflow. The underlying pages
// (/admin/builders, /admin/localities) still exist and are reachable via their dashboard stat
// tiles for editing richer content (awards, market snapshots, SEO) that Project doesn't
// capture -- they're just no longer primary navigation destinations.
const QUICK_ADD_LINKS = [
  { label: "Project", href: "/admin/projects/new" },
  { label: "Transaction", href: "/admin/transactions/new" },
];

const ACTIVITY_LAST_SEEN_KEY = "mi_admin_activity_last_seen";

// No cross-tab sync needed -- the only writer is this component's own click handler, which
// already re-renders via setOpenMenu, so useSyncExternalStore just needs a snapshot getter
// (re-read fresh each render) plus a stable no-op subscription and an SSR-safe server snapshot.
function subscribeToActivitySeen() {
  return () => {};
}
function getActivityLastSeen(): number {
  const stored = Number(window.localStorage.getItem(ACTIVITY_LAST_SEEN_KEY) ?? "0");
  return Number.isFinite(stored) ? stored : 0;
}
function getActivityLastSeenServer(): number {
  return 0;
}

function describeActivity(item: ActivityItem): string {
  const actor = item.actor?.name ?? item.actor?.email ?? "System";
  const [entity, verb] = item.action.split(".").length >= 2 ? [item.action.split(".")[0], item.action.split(".").slice(1).join(" ")] : [item.entityType, item.action];
  return `${actor} — ${entity} ${verb}`;
}

type MenuKey = "quickadd" | "notifications" | "reports" | "profile" | null;

export default function AdminTopbar({
  session,
  activity,
  notifications,
  onOpenSearch,
}: {
  session: SessionPayload;
  activity: ActivityItem[];
  notifications: NotificationItem[];
  onOpenSearch: () => void;
}) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [, startMarkRead] = useTransition();
  const lastSeenAt = useSyncExternalStore(subscribeToActivitySeen, getActivityLastSeen, getActivityLastSeenServer);

  const quickAddRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const reportsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // The old design used a "fixed inset-0" click-catcher rendered inside this header to close a
  // menu on an outside click. The header has `backdrop-blur` (backdrop-filter), which per spec
  // makes it a containing block for `position: fixed` descendants -- so that catcher was only
  // ever "fixed" to the header's own ~48px bar, not the viewport, and clicking anywhere in the
  // actual page below never reached it. A real document-level listener has no such trap.
  useEffect(() => {
    if (!openMenu) return;
    const refs: Record<Exclude<MenuKey, null>, React.RefObject<HTMLDivElement | null>> = {
      quickadd: quickAddRef,
      notifications: notificationsRef,
      reports: reportsRef,
      profile: profileRef,
    };
    function handleClickOutside(event: MouseEvent) {
      const activeRef = refs[openMenu as Exclude<MenuKey, null>];
      if (activeRef.current && !activeRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu]);

  function toggle(menu: MenuKey) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function openNotifications() {
    const wasOpen = openMenu === "notifications";
    setOpenMenu(wasOpen ? null : "notifications");
    if (!wasOpen && activity.length > 0) {
      const latest = Math.max(...activity.map((item) => new Date(item.at).getTime()));
      window.localStorage.setItem(ACTIVITY_LAST_SEEN_KEY, String(latest));
    }
  }

  const unreadCount = activity.filter((item) => new Date(item.at).getTime() > lastSeenAt).length;
  const unreadNotificationCount = notifications.filter((n) => !n.readAt).length;

  function openReports() {
    setOpenMenu((current) => (current === "reports" ? null : "reports"));
  }

  // Server Actions called as plain functions (not <form action>) don't cause the calling
  // Client Component to re-render just because they run revalidatePath() internally --
  // that only invalidates the Router Cache, it doesn't refetch already-mounted components.
  // Without an explicit router.refresh() after the mutation actually commits, the unread
  // badge here can stay stuck at its stale count indefinitely. This was the real bug behind
  // "Reports [2] doesn't decrease": clicking a notification raced its own navigation against
  // a fire-and-forget write with no refresh, and "Mark all read" (no navigation at all) had
  // no way to ever pick up the new state.
  function readNotification(id: string) {
    startMarkRead(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function readAllNotifications() {
    startMarkRead(async () => {
      await Promise.all(notifications.filter((n) => !n.readAt).map((n) => markNotificationReadAction(n.id)));
      router.refresh();
    });
  }

  function openNotificationItem(item: NotificationItem) {
    setOpenMenu(null);
    startMarkRead(async () => {
      if (!item.readAt) await markNotificationReadAction(item.id);
      router.refresh();
      router.push("/admin/reports");
    });
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur">
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex flex-1 max-w-md items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-left text-xs text-muted transition-colors hover:border-accent/50"
      >
        <span>Search projects, builders, localities…</span>
        <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
      </button>

      <div className="flex-1" />

      <div className="relative" ref={quickAddRef}>
        <button
          type="button"
          onClick={() => toggle("quickadd")}
          className="rounded-sm bg-accent px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
        >
          + Quick Add
        </button>
        {openMenu === "quickadd" ? (
          <div className="absolute right-0 z-40 mt-1.5 w-40 overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xl">
            {QUICK_ADD_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpenMenu(null)}
                className="block px-3 py-2 text-xs text-foreground hover:bg-accent/10 hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative" ref={notificationsRef}>
        <button
          type="button"
          onClick={openNotifications}
          className="relative rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-foreground"
        >
          Activity
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
        {openMenu === "notifications" ? (
          <div className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xl">
            <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
              Recent activity
            </p>
            <div className="max-h-80 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted">No activity recorded yet.</p>
              ) : (
                activity.map((item) => (
                  <div key={item.id} className="border-b border-border px-3 py-2 last:border-b-0">
                    <p className="text-xs text-foreground">{describeActivity(item)}</p>
                    <p className="text-[10px] text-muted">{formatDate(item.at)}</p>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/admin/activity"
              onClick={() => setOpenMenu(null)}
              className="block border-t border-border px-3 py-2 text-center text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-surface"
            >
              View full activity log →
            </Link>
          </div>
        ) : null}
      </div>

      <div className="relative" ref={reportsRef}>
        <button
          type="button"
          onClick={openReports}
          className="relative rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-foreground"
        >
          Reports
          {unreadNotificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
            </span>
          ) : null}
        </button>
        {openMenu === "reports" ? (
          <div className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Report notifications</p>
              <div className="flex items-center gap-2">
                {unreadNotificationCount > 0 ? (
                  <button type="button" onClick={readAllNotifications} className="text-[10px] text-muted hover:text-accent hover:underline">
                    Mark all read
                  </button>
                ) : null}
                <Link href="/admin/reports" onClick={() => setOpenMenu(null)} className="text-[10px] text-accent hover:underline">
                  View all →
                </Link>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted">No report notifications yet.</p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotificationItem(item)}
                    className={`block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent/5 ${item.readAt ? "opacity-60" : "bg-accent/5"}`}
                  >
                    <div className="flex items-start gap-1.5">
                      {!item.readAt ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
                      <p className={`text-xs ${item.readAt ? "text-muted" : "font-semibold text-foreground"}`}>{item.title}</p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{item.body}</p>
                    <p className="mt-1 text-[10px] text-muted">{formatDateTime(item.createdAt)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative" ref={profileRef}>
        <button
          type="button"
          onClick={() => toggle("profile")}
          className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-accent/50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 font-mono text-[10px] font-bold text-accent">
            {(session.name ?? session.email).slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden sm:inline">{session.name ?? session.email}</span>
        </button>
        {openMenu === "profile" ? (
          <div className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xl">
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-xs text-foreground">{session.name ?? "Founder"}</p>
              <p className="truncate text-[10px] text-muted">{session.email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-accent">{session.role}</p>
            </div>
            <Link
              href="/admin/settings"
              onClick={() => setOpenMenu(null)}
              className="block px-3 py-2 text-xs text-foreground hover:bg-accent/10 hover:text-accent"
            >
              Settings
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-negative/10 hover:text-negative"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
