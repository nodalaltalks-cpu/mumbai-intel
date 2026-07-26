"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SessionPayload } from "@/lib/auth/session";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar, { type ActivityItem } from "./AdminTopbar";
import CommandPalette from "./CommandPalette";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";

export default function AdminShell({
  session,
  activity,
  children,
}: {
  session: SessionPayload;
  activity: ActivityItem[];
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target && ["INPUT", "TEXTAREA"].includes(target.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "?" && !isTyping) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setShortcutsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar session={session} activity={activity} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main-content" className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette key={searchOpen ? "search-open" : "search-closed"} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
