import type { Metadata } from "next";
import { getSavedSearchNotificationEligibility } from "@/lib/admin-queries";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Saved-Search Alerts — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function SavedSearchAlertsPage() {
  const rows = await getSavedSearchNotificationEligibility();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Saved-Search Alerts</h1>
        <p className="text-xs text-muted">
          Every saved search with &ldquo;Alert me when this finds a new match&rdquo; turned on. Only these users should ever receive a
          saved-search notification email.
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Note: no automated job currently matches new listings against these searches and sends the alert — that matcher doesn&apos;t exist
          yet. This page is the honest opt-in list to build it against, not a claim that alerts are being sent today.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted">No users have opted into saved-search alerts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Saved search</th>
                <th className="px-3 py-2 font-medium">Opted in since</th>
                <th className="px-3 py-2 font-medium">Last notification sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2 font-mono text-foreground">{row.publicUser.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{row.publicUser.email}</td>
                  <td className="px-3 py-2 text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-2 text-muted">{row.lastNotifiedAt ? formatDateTime(row.lastNotifiedAt) : "Never sent"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
