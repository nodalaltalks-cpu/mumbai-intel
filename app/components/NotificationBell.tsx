"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { markPublicNotificationReadAction } from "@/lib/actions/notifications";
import { formatDateTime } from "@/lib/format";
import type { PublicNotificationItem } from "@/lib/queries/dashboard";

/** Public-facing equivalent of AdminTopbar's "Reports" bell — same Notification table, same read/unread pattern, just scoped to the signed-in visitor's own report-lifecycle notifications (received / under review / resolved). */
export default function NotificationBell({ notifications }: { notifications: PublicNotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [, startMarkRead] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  function readNotification(id: string) {
    startMarkRead(() => {
      void markPublicNotificationReadAction(id);
    });
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-raised text-muted transition-colors hover:border-accent hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
          <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mi-pop-in absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">Notifications</p>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">No notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.readAt) readNotification(item.id);
                  }}
                  className={`cursor-pointer border-b border-border px-3 py-2 last:border-b-0 hover:bg-accent/5 ${item.readAt ? "opacity-60" : "bg-accent/5"}`}
                >
                  <div className="flex items-start gap-1.5">
                    {!item.readAt ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /> : null}
                    <p className={`text-xs ${item.readAt ? "text-muted" : "font-semibold text-foreground"}`}>{item.title}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{item.body}</p>
                  <p className="mt-1 text-[10px] text-muted">{formatDateTime(item.createdAt)}</p>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border px-3 py-2">
            <Link href="/account" onClick={() => setOpen(false)} className="text-[10px] text-accent hover:underline">
              View account →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
