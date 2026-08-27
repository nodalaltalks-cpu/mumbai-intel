"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/actions/public-auth";
import type { NavbarPublicUser } from "./NavbarActions";

function initialsOf(user: NavbarPublicUser): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

export default function ProfileMenu({ user }: { user: NavbarPublicUser }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-[11px] font-mono font-semibold text-foreground transition-colors hover:border-accent"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initialsOf(user)
        )}
      </button>

      {open ? (
        <div className="mi-pop-in absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-sm border border-border bg-surface shadow-2xl">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-foreground">{user.name ?? "NoDalalTalks user"}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          {/* My Profile is the primary, visually-strongest action (Section 8) — bold, accent-tinted, listed first, distinct from the plain secondary links below it. */}
          <div className="p-1.5">
            <Link
              href="/account?tab=profile"
              onClick={() => setOpen(false)}
              className="block rounded-sm bg-accent/10 px-2.5 py-2.5 text-left text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              My Profile
            </Link>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-border p-1.5">
            <Link
              href="/account?tab=profile#saved-projects"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
            >
              Saved Projects
            </Link>
            <Link
              href="/account?tab=searches"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
            >
              Saved Searches
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
            >
              Settings
            </Link>
          </div>
          {/* Logout stays easy to find and tap (no dark patterns) but visually secondary — smaller and muted rather than the dominant action. */}
          <div className="border-t border-border p-1.5">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-sm px-2.5 py-1.5 text-left text-[11px] text-muted transition-colors hover:bg-negative/10 hover:text-negative"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
