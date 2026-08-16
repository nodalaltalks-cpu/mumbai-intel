"use client";

import Link from "next/link";
import { useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import type { SessionPayload } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  at: Date;
  actor: { name: string | null; email: string } | null;
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

function describeActivity(item: ActivityItem): string {
  const actor = item.actor?.name ?? item.actor?.email ?? "System";
  const [entity, verb] = item.action.split(".").length >= 2 ? [item.action.split(".")[0], item.action.split(".").slice(1).join(" ")] : [item.entityType, item.action];
  return `${actor} — ${entity} ${verb}`;
}

type MenuKey = "quickadd" | "notifications" | "profile" | null;

export default function AdminTopbar({
  session,
  activity,
  onOpenSearch,
}: {
  session: SessionPayload;
  activity: ActivityItem[];
  onOpenSearch: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);

  function toggle(menu: MenuKey) {
    setOpenMenu((current) => (current === menu ? null : menu));
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

      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("quickadd")}
          className="rounded-sm bg-accent px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
        >
          + Quick Add
        </button>
        {openMenu === "quickadd" ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
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
          </>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => toggle("notifications")}
          className="relative rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-foreground"
        >
          Activity
          {activity.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {activity.length > 9 ? "9+" : activity.length}
            </span>
          ) : null}
        </button>
        {openMenu === "notifications" ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
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
            </div>
          </>
        ) : null}
      </div>

      <div className="relative">
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
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
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
          </>
        ) : null}
      </div>
    </header>
  );
}
