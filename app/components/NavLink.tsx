"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Nav link that highlights itself when the current route matches — used in both the desktop and mobile nav rows. */
export default function NavLink({ href, className = "", activeClassName = "", children }: { href: string; className?: string; activeClassName?: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${className} ${active ? activeClassName || "text-foreground" : "text-muted"}`}>
      {children}
    </Link>
  );
}
