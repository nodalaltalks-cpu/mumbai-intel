import Link from "next/link";
import type { Metadata } from "next";
import {
  getActivityFeed,
  getDashboardCharts,
  getDashboardStats,
  getLatestUpload,
  getRecentProjectsAdmin,
  getRecentTransactionsAdmin,
  getUserGrowthStats,
} from "@/lib/admin-queries";
import { formatDate, formatPaise } from "@/lib/format";
import { STATUS_CHART_COLOR, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import BarChart from "@/app/admin/components/charts/BarChart";
import DonutChart from "@/app/admin/components/charts/DonutChart";
import { getSession } from "@/lib/auth/session";
import PlatformHealthSummaryCard from "@/app/admin/components/PlatformHealthSummaryCard";

export const metadata: Metadata = { title: "Dashboard — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

function StatTile({ label, value, href, hint }: { label: string; value: string | number; href?: string; hint?: string }) {
  const body = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
    </>
  );
  if (!href) {
    return <div className="rounded-sm border border-border bg-surface p-4">{body}</div>;
  }
  return (
    <Link
      href={href}
      className="rounded-sm border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-raised"
    >
      {body}
    </Link>
  );
}

function describeActivity(action: string): string {
  const parts = action.split(".");
  return parts.join(" ");
}

export default async function AdminDashboardPage() {
  const session = await getSession();
  const [stats, charts, recentProjects, recentTransactions, activity, latestUpload, growth] = await Promise.all([
    getDashboardStats(),
    getDashboardCharts(),
    getRecentProjectsAdmin(5),
    getRecentTransactionsAdmin(5),
    getActivityFeed(12),
    getLatestUpload(),
    getUserGrowthStats(),
  ]);

  const stickinessPercent = growth.mau > 0 ? Math.round((growth.dau / growth.mau) * 100) : 0;

  const statusDonutData = charts.byStatus.map((bucket) => ({
    label: STATUS_LABEL[bucket.label as ProjectStatus] ?? bucket.label,
    count: bucket.count,
    colorVar: STATUS_CHART_COLOR[bucket.label as ProjectStatus] ?? "--muted",
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted">Live counts from the database</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/projects/new" className="rounded-sm bg-accent px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim">
            New Project
          </Link>
          <Link href="/admin/transactions/new" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            New Transaction
          </Link>
        </div>
      </div>

      {/* Builders/Localities/Images counts dropped from this live grid to match Project+Transaction
          as the two primary dashboard destinations -- the underlying database records are
          completely untouched, and the pages themselves stay reachable via ⌘K search
          (Builders/Localities) and the sidebar's Media section (Images). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Projects" value={stats.projectCount} href="/admin/projects" />
        <StatTile label="Published" value={stats.publishedCount} href="/admin/projects?published=1" />
        <StatTile label="Drafts" value={stats.draftCount} href="/admin/projects?published=0" />
        <StatTile label="Under Review" value={stats.reviewCount} href="/admin/projects?published=review" />
        <StatTile label="Archived" value={stats.archivedCount} href="/admin/projects?archived=1" />
        <StatTile label="Transactions" value={stats.transactionCount} href="/admin/transactions" />
      </div>

      {/* Part 22: Founder-only, not shown to EDITOR/VIEWER — infrastructure visibility stays ADMIN-gated everywhere, including this summary card. */}
      {session?.role === "ADMIN" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlatformHealthSummaryCard />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Average starting price</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{formatPaise(stats.avgPricePaise)}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Latest upload</p>
          {latestUpload ? (
            <>
              <p className="mt-1.5 truncate font-mono text-sm text-foreground">{latestUpload.project.name}</p>
              <p className="text-[10px] text-muted">
                {latestUpload.kind} · {formatDate(latestUpload.createdAt)}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-muted">No images uploaded yet.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold text-foreground">Growth — registered users</h2>
          <p className="text-xs text-muted">
            Most property portals track signups and traffic and call it growth, then get surprised when neither
            converts. Signups are cheap when research doesn&apos;t require a phone number; the number that actually
            matters is how many of those people keep coming back. DAU/WAU/MAU and stickiness below are all
            &quot;distinct registered users with real research activity&quot; (a project view, search, compare, or
            wishlist add) — not raw traffic, which Google Analytics already covers.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Registered Users" value={growth.totalUsers} href="/admin/analytics/registered-users" />
          <StatTile label="Daily Active" value={growth.dau} hint="Last 24h" />
          <StatTile label="Weekly Active" value={growth.wau} hint="Last 7d" />
          <StatTile label="Monthly Active" value={growth.mau} hint="Last 30d" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Stickiness" value={`${stickinessPercent}%`} hint="DAU ÷ MAU" />
          <StatTile label="New Signups" value={growth.newLast7d} hint="Last 7d" />
          <StatTile label="New Signups" value={growth.newLast30d} hint="Last 30d" />
          <StatTile label="Email Verified" value={`${growth.emailVerifiedPercent}%`} hint={`${growth.emailVerifiedCount} of ${growth.totalUsers}`} />
        </div>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h3 className="mb-3 font-mono text-sm font-semibold text-foreground">Active users, last 14 days</h3>
          <BarChart data={growth.activeTrend} emptyLabel="No research activity in this window" />
        </section>

        <p className="text-[11px] text-muted">
          Sign-up channel mix, the 30-day signup trend and per-feature funnel drop-off live on{" "}
          <Link href="/admin/analytics/registration-funnel" className="text-accent hover:underline">
            Registration Funnel
          </Link>{" "}
          · full event-level detail (top viewed projects/builders/localities, event type breakdown) on{" "}
          <Link href="/admin/analytics/research" className="text-accent hover:underline">
            Research Intent
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Projects by locality</h2>
          <BarChart data={charts.byLocality} emptyLabel="No projects yet" />
        </section>
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Projects by builder</h2>
          <BarChart data={charts.byBuilder} emptyLabel="No projects linked to a builder yet" />
        </section>
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Construction status distribution</h2>
          <DonutChart data={statusDonutData} emptyLabel="No projects yet" />
        </section>
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Price distribution</h2>
          <BarChart data={charts.priceDistribution} emptyLabel="No priced projects yet" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-sm border border-border bg-surface p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Activity feed</h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-xs text-muted">No admin activity recorded yet.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {activity.map((item) => (
                <li key={item.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <p className="text-xs text-foreground">
                    <span className="text-muted">{item.actor?.name ?? item.actor?.email ?? "System"}</span>{" "}
                    {describeActivity(item.action)}
                  </p>
                  <p className="text-[10px] text-muted">{formatDate(item.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Recently updated projects</h2>
            <Link href="/admin/projects" className="text-xs text-muted hover:text-accent">
              View all →
            </Link>
          </div>
          {recentProjects.length === 0 ? (
            <p className="text-xs text-muted">No projects yet. Add your first from Project Management.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentProjects.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/projects/${project.id}/edit`}
                      className="truncate font-mono text-xs text-foreground hover:text-accent"
                    >
                      {project.name}
                    </Link>
                    <p className="text-[10px] text-muted">{project.locality.name}</p>
                  </div>
                  <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted">
                    {STATUS_LABEL[project.status as ProjectStatus]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-foreground">Recent transactions</h2>
            <Link href="/admin/transactions" className="text-xs text-muted hover:text-accent">
              View all →
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-xs text-muted">No transactions recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentTransactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{tx.locality.name}</p>
                    <p className="text-[10px] text-muted">{formatDate(tx.registrationDate)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-foreground">{formatPaise(tx.valuePaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
