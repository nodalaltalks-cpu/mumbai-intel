"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import type { SessionPayload } from "@/lib/auth/session";

const NAV_SECTIONS: { label: string; links: { label: string; href: string }[] }[] = [
  {
    label: "Overview",
    links: [{ label: "Dashboard", href: "/admin" }],
  },
  {
    label: "Catalog",
    links: [{ label: "Projects", href: "/admin/projects" }],
  },
  {
    label: "Market data",
    links: [
      { label: "Transactions", href: "/admin/transactions" },
      { label: "Price Trends", href: "/admin/price-trends" },
      { label: "Market Intelligence", href: "/admin/market-intelligence" },
    ],
  },
  {
    label: "Media",
    links: [{ label: "Images", href: "/admin/images" }],
  },
  {
    label: "Analytics",
    links: [{ label: "Analytics", href: "/admin/analytics" }],
  },
  {
    label: "Reports",
    links: [{ label: "Report Inaccurate", href: "/admin/reports" }],
  },
  {
    label: "Email",
    links: [{ label: "Campaigns", href: "/admin/email" }],
  },
  {
    label: "Data Sync",
    links: [
      { label: "Sync Dashboard", href: "/admin/data-sync" },
      { label: "Import Data", href: "/admin/data-sync/import" },
      { label: "Review Queue", href: "/admin/data-sync/review" },
    ],
  },
  {
    label: "System",
    links: [
      { label: "Trash", href: "/admin/trash" },
      { label: "Users", href: "/admin/users" },
      { label: "Settings", href: "/admin/settings" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col border-border bg-surface md:h-screen md:w-56 md:sticky md:top-0 md:border-r">
      <div className="border-b border-border px-4 py-4">
        <Link href="/" className="font-mono text-sm font-bold tracking-widest text-foreground">
          NODALAL<span className="text-accent">TALKS</span>
        </Link>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">Founder Admin</p>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-x-auto p-2 md:overflow-y-auto md:overflow-x-visible">
        {NAV_SECTIONS.filter((section) => section.label !== "System" || session.role === "ADMIN").map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted/60">{section.label}</p>
            {section.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shrink-0 rounded-sm px-3 py-2 text-xs uppercase tracking-wide transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <p className="truncate font-mono text-xs text-foreground">{session.name ?? session.email}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted">{session.role}</p>
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            className="w-full rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-negative hover:text-negative"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
