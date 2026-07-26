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
            <p className="truncate text-xs font-semibold text-foreground">{user.name ?? "Mumbai Intel user"}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <div className="flex flex-col p-1.5">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
            >
              My Profile
            </Link>
            <Link
              href="/account#saved-projects"
              onClick={() => setOpen(false)}
              className="rounded-sm px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-raised"
            >
              Saved Projects
            </Link>
            <button
              type="button"
              disabled
              className="flex items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs text-muted/60 cursor-not-allowed"
            >
              Saved Searches
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted/60">Soon</span>
            </button>
          </div>
          <div className="border-t border-border p-1.5">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-sm px-2.5 py-2 text-left text-xs text-negative transition-colors hover:bg-negative/10"
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
