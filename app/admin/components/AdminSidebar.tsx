"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions/auth";
import type { SessionPayload } from "@/lib/auth/session";

const NAV_SECTIONS: { label: string; links: { label: string; href: string }[] }[] = [
  {
    label: "Overview",
    links: [
      { label: "Dashboard", href: "/admin" },
      { label: "Activity", href: "/admin/activity" },
    ],
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
    links: [
      { label: "Overview", href: "/admin/analytics" },
      { label: "Visitors", href: "/admin/analytics/visitors" },
      { label: "User Retention", href: "/admin/analytics/user-retention" },
      { label: "Search Analytics", href: "/admin/analytics/search" },
      { label: "Research Intent", href: "/admin/analytics/research" },
      { label: "Brochure Analytics", href: "/admin/analytics/brochures" },
      { label: "Profile Completion", href: "/admin/analytics/profile-completion" },
      { label: "Registration Funnel", href: "/admin/analytics/registration-funnel" },
      { label: "User Demand", href: "/admin/analytics/user-demand" },
      { label: "Data Quality", href: "/admin/analytics/data-quality" },
      { label: "Referrals", href: "/admin/analytics/referrals" },
      { label: "Registered Users", href: "/admin/analytics/registered-users" },
      { label: "Newsletter", href: "/admin/analytics/newsletter" },
      { label: "Recommendation Intelligence", href: "/admin/recommendations" },
    ],
  },
  {
    label: "Reports",
    links: [{ label: "Report Inaccurate", href: "/admin/reports" }],
  },
  {
    label: "Support",
    links: [{ label: "Contact Enquiries", href: "/admin/contact-enquiries" }],
  },
  {
    label: "Notifications",
    links: [
      { label: "Notifications", href: "/admin/notifications" },
      { label: "Notification Analytics", href: "/admin/analytics/notifications" },
    ],
  },
  {
    label: "Email",
    links: [{ label: "Saved-Search Alerts", href: "/admin/analytics/saved-search-alerts" }],
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
      { label: "System Health", href: "/admin/system-health" },
      { label: "Platform Health", href: "/admin/platform-health" },
      { label: "Trash", href: "/admin/trash" },
      { label: "Users", href: "/admin/users" },
      { label: "Approvals", href: "/admin/approvals" },
      { label: "Settings", href: "/admin/settings" },
    ],
  },
];

function matchesRoute(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Several sidebar hrefs are nested under another entry's path (e.g. Search
 * Analytics at /admin/analytics/search sits under the Analytics entry's own
 * /admin/analytics), so a plain per-link prefix check lights up both at
 * once. Only the single longest (most specific) matching href should be
 * active — same fix applies uniformly to every such pair in the sidebar,
 * not just Analytics/Search Analytics.
 */
function findActiveHref(pathname: string, allHrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of allHrefs) {
    if (matchesRoute(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export default function AdminSidebar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    NAV_SECTIONS.flatMap((section) => section.links.map((link) => link.href))
  );

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
              const active = link.href === activeHref;
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
