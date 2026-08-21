import Link from "next/link";
import type { Metadata } from "next";
import { getUserDemandSummary, getLocalityDemandSignals } from "@/lib/analytics/user-demand-queries";
import { formatDate } from "@/lib/format";
import BarChart from "@/app/admin/components/charts/BarChart";

export const metadata: Metadata = { title: "User Demand — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function UserDemandPage() {
  const [demand, localitySignals] = await Promise.all([getUserDemandSummary(), getLocalityDemandSignals(30)]);
  const localityData = demand.byLocality.slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">User Demand / Preferences</h1>
          <p className="text-xs text-muted">
            What researchers actually want, from real UserPreferences records only — no invented numbers —{" "}
            <Link href="/admin/analytics" className="text-accent hover:underline">
              Analytics
            </Link>{" "}
            ·{" "}
            <Link href="/admin/analytics/profile-completion" className="text-accent hover:underline">
              Profile Completion breakdown
            </Link>
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-sm border border-positive/40 bg-positive/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-positive">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true" />
          Live — computed on every page load
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Registered Users</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{demand.totalUsers}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">With Any Preference Set</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{demand.usersWithAnyPreference}</p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Self Use / Investment / Both</p>
          <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">
            {demand.selfUseCount} / {demand.investmentCount} / {demand.bothCount}
          </p>
        </div>
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Localities Mentioned</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{demand.byLocality.length}</p>
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Popular locations</h2>
        <p className="mb-3 text-[11px] text-muted">
          Structured picks from the Locality catalog and free-text landmark/area entries, combined — hover a bar to distinguish. Emerging
          locations are ones with only free-text mentions and no catalog page yet.
        </p>
        {localityData.length === 0 ? (
          <p className="text-xs text-muted">No location preferences recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {localityData.map((l) => (
              <li key={`${l.source}-${l.label}`} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-xs text-foreground">
                  {l.label}
                  {l.source === "free_text" ? <span className="ml-1.5 rounded-sm border border-border px-1 text-[9px] uppercase text-muted">free text</span> : null}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(l.count / (localityData[0]?.count || 1)) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-muted">{l.count} user{l.count === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Locality demand signals</h2>
        <p className="mb-3 text-[11px] text-muted">
          Every time a user types a new locality/landmark into their Research Profile — first seen, most recent activity, and how many times
          it&apos;s come up. A repeated term here is a real signal to add coverage.
        </p>
        {localitySignals.length === 0 ? (
          <p className="text-xs text-muted">No signals recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Locality</th>
                  <th className="px-3 py-2 font-medium text-right">Signals</th>
                  <th className="px-3 py-2 font-medium">First seen</th>
                  <th className="px-3 py-2 font-medium">Latest activity</th>
                </tr>
              </thead>
              <tbody>
                {localitySignals.map((s) => (
                  <tr key={s.locality} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                    <td className="px-3 py-2 font-mono text-foreground">{s.locality}</td>
                    <td className="px-3 py-2 text-right font-mono text-accent">{s.signalCount}</td>
                    <td className="px-3 py-2 text-muted">{formatDate(s.firstSeen)}</td>
                    <td className="px-3 py-2 text-muted">{formatDate(s.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Budget distribution</h2>
          <BarChart data={demand.byBudget.map((b) => ({ label: b.label, count: b.count }))} emptyLabel="No budget preferences recorded yet" />
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Configuration (BHK) demand</h2>
          <BarChart data={demand.byConfiguration.map((c) => ({ label: c.label, count: c.count }))} emptyLabel="No configuration preferences recorded yet" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Property type demand</h2>
          {demand.byPropertyType.length === 0 ? (
            <p className="text-xs text-muted">No property type preferences recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {demand.byPropertyType.map((p) => (
                <li key={p.label} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{p.label}</span>
                  <span className="font-mono text-accent">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-foreground">Ready-to-move vs. Under-construction demand</h2>
          {demand.byReadiness.length === 0 ? (
            <p className="text-xs text-muted">No status preferences recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {demand.byReadiness.map((r) => (
                <li key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{r.label}</span>
                  <span className="font-mono text-accent">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[11px] text-muted">
        This should help decide which projects to add, which localities to prioritize research on, and which data gaps matter most — every
        number above traces to a real UserPreferences record, none are estimated.
      </p>
    </div>
  );
}
