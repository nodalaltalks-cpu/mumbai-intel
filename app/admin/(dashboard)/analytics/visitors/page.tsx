import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getVisitorAcquisitionBreakdown, getVisitorOverview, getVisitorSourceBreakdown } from "@/lib/analytics/visitor-queries";
import {
  getChannelQualityBreakdown,
  getLandingPageBreakdown,
  getSearchIntentBySource,
  getAnonymousJourneyFunnel,
  getReturningVisitorInsights,
  getDeviceBreakdown,
  getGeoBreakdown,
  getGeoCountryRows,
  getGeoRegionRows,
  getGeoCityRows,
  getGeoSourceBreakdown,
  getGeoBehaviourBreakdown,
  getLiveActivityBreakdown,
  getFounderInsights,
} from "@/lib/analytics/visitor-intelligence";
import { ANALYTICS_PERIOD_COOKIE, computeChange, resolveAnalyticsPeriodFromRequest } from "@/lib/analytics/period";
import { getActiveUserCounts, getTodayActiveCount } from "@/lib/platform-metrics/presence";
import AnalyticsPeriodFilter from "@/app/admin/components/AnalyticsPeriodFilter";
import AnalyticsStatCard from "@/app/admin/components/AnalyticsStatCard";

export const metadata: Metadata = { title: "Visitors — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  organic_search: "Organic Search",
  social: "Social",
  direct: "Direct",
  whatsapp: "WhatsApp",
  referral: "Referral",
  other: "Other / Unknown",
};

const SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  google_discover: "Google Discover",
  direct: "Direct",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  x_twitter: "X (Twitter)",
  reddit: "Reddit",
  email: "Email",
  referral: "Referral link",
  other_website: "Other website",
  unknown: "Unknown",
};

const ACTIVITY_LABEL: Record<string, string> = {
  browsing: "Browsing",
  searching: "Searching",
  viewing_project: "Viewing a project",
  viewing_transaction: "Viewing a transaction",
  viewing_brochure: "Viewing a brochure/floor plan",
  researching: "Researching (compare/save/market data)",
};

export default async function VisitorsAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const session = await requireSession();
  if (!(await hasPermission(session, "users.view"))) redirect("/admin");
  const params = await searchParams;
  const cookieStore = await cookies();
  const period = resolveAnalyticsPeriodFromRequest(params, cookieStore.get(ANALYTICS_PERIOD_COOKIE)?.value);

  const [
    overview,
    sourceBreakdown,
    acquisition,
    todayActiveCount,
    channelQuality,
    landingPages,
    searchBySource,
    anonymousJourney,
    returningInsights,
    deviceBreakdown,
    geoBreakdown,
    geoCountryRows,
    geoRegionRows,
    geoCityRows,
    geoSourceRows,
    geoBehaviourRows,
    liveActivity,
    founderInsights,
  ] = await Promise.all([
    getVisitorOverview(period),
    getVisitorSourceBreakdown(period),
    getVisitorAcquisitionBreakdown(period),
    getTodayActiveCount(),
    getChannelQualityBreakdown(period),
    getLandingPageBreakdown(period),
    getSearchIntentBySource(period),
    getAnonymousJourneyFunnel(period),
    getReturningVisitorInsights(period),
    getDeviceBreakdown(period),
    getGeoBreakdown(period),
    getGeoCountryRows(period),
    getGeoRegionRows(period),
    getGeoCityRows(period),
    getGeoSourceBreakdown(period),
    getGeoBehaviourBreakdown(period),
    getLiveActivityBreakdown(),
    getFounderInsights(period),
  ]);
  // Part 12/13 — "Live Now", reusing Platform Health's existing PresenceHeartbeat
  // infrastructure (lib/platform-metrics/presence.ts) rather than a second
  // presence system. Real-time, independent of the period filter above.
  const liveNow = await getActiveUserCounts(todayActiveCount);
  const anonymousChange = computeChange(overview.anonymousVisitors, overview.previousAnonymousVisitors);

  const anonToRegisteredPercent =
    overview.anonymousVisitors > 0 ? Math.round((overview.anonymousToRegistered / overview.anonymousVisitors) * 100) : null;
  const anonToResearcherPercent =
    overview.anonymousVisitors > 0 ? Math.round((overview.anonymousToActiveResearcher / overview.anonymousVisitors) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Visitors</h1>
          <p className="text-xs text-muted">
            Anonymous visitor measurement from the existing consented first-party cookie (mi_anon_id) and research event
            log — no raw cookie values, no individual tracking shown here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/analytics" className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent">
            ← Analytics
          </Link>
          <AnalyticsPeriodFilter current={period.key} currentFrom={params.from} currentTo={params.to} label={period.label} dateRangeLabel={period.dateRangeLabel} />
        </div>
      </div>

      <section className="rounded-sm border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground">Live now</h2>
          <span className="inline-flex items-center gap-1 rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-positive">
            <span className="h-1 w-1 rounded-full bg-positive" aria-hidden="true" />
            Real-time
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Active now</p>
            <p className="font-mono text-xl font-semibold text-foreground">{liveNow.activeNow}</p>
            <p className="text-[10px] text-muted">{liveNow.anonymousActiveNow} anonymous · {liveNow.registeredActiveNow} registered</p>
          </div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted">Last 5 minutes</p><p className="font-mono text-xl font-semibold text-foreground">{liveNow.active5m}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted">Last 30 minutes</p><p className="font-mono text-xl font-semibold text-foreground">{liveNow.active30m}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted">Today (unique)</p><p className="font-mono text-xl font-semibold text-foreground">{liveNow.activeToday}</p></div>
        </div>
        {liveActivity.activeNow > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.entries(liveActivity.byActivity) as [string, number][])
              .filter(([, count]) => count > 0)
              .map(([activity, count]) => (
                <div key={activity}>
                  <p className="text-[10px] uppercase tracking-wide text-muted">{ACTIVITY_LABEL[activity] ?? activity}</p>
                  <p className="font-mono text-base font-semibold text-foreground">{count}</p>
                </div>
              ))}
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-muted">
          Last updated: just now · activity is each visitor&apos;s most recent tracked action in the last 2 minutes, not a guaranteed instantaneous read.
        </p>
      </section>

      {/* Part 13 — plain-language insights, generated only from the real aggregates below; never fabricated. */}
      <section className="rounded-sm border border-accent/30 bg-accent/5 p-4">
        <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">Founder insights — {period.label}</h2>
        {founderInsights.length === 0 ? (
          <p className="text-xs text-muted">Not enough data yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs text-foreground">
            {founderInsights.map((insight, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>{insight}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AnalyticsStatCard
          label="Anonymous visitors"
          value={overview.anonymousVisitors}
          previousValue={overview.previousAnonymousVisitors}
          change={anonymousChange}
        />
        <AnalyticsStatCard label="New visitors" value={overview.newVisitors} />
        <AnalyticsStatCard label="Returning visitors" value={overview.returningVisitors} />
        <AnalyticsStatCard label="Anonymous → registered" value={overview.anonymousToRegistered} />
        <AnalyticsStatCard label="Anonymous → active researcher" value={overview.anonymousToActiveResearcher} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Anonymous → Registered</h2>
          <p className="mb-3 text-[11px] text-muted">Of anonymous visitors in {period.label.toLowerCase()}, what share went on to create an account.</p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">{anonToRegisteredPercent !== null ? `${anonToRegisteredPercent}%` : "--"}</p>
            <p className="text-xs text-muted">
              {overview.anonymousToRegistered} of {overview.anonymousVisitors} anonymous visitors
            </p>
          </div>
        </section>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Anonymous → Active Researcher</h2>
          <p className="mb-3 text-[11px] text-muted">
            Of anonymous visitors in {period.label.toLowerCase()}, what share searched, viewed a project, or otherwise
            showed real research intent (not just a page arrival).
          </p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-3xl font-semibold text-accent">{anonToResearcherPercent !== null ? `${anonToResearcherPercent}%` : "--"}</p>
            <p className="text-xs text-muted">
              {overview.anonymousToActiveResearcher} of {overview.anonymousVisitors} anonymous visitors
            </p>
          </div>
        </section>
      </div>

      {/* Part 8 — the fuller anonymous -> registered step funnel, from real events only. "Profile step" is placed after Registered (not before) because an anonymous visitor has no profile to interact with until they sign up. */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Anonymous visitor journey — {period.label}</h2>
        <p className="mb-3 text-[11px] text-muted">Each stage counts distinct sessions/users who reached at least that far — not a strict single-path funnel.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Anonymous visitor", count: anonymousJourney.anonymousVisitors },
            { label: "Searched / researched", count: anonymousJourney.searchedOrBrowsed },
            { label: "Registered", count: anonymousJourney.registered },
            { label: "Completed a profile step", count: anonymousJourney.completedProfileStep },
            { label: "Saved / compared", count: anonymousJourney.savedOrCompared },
            { label: "Contacted", count: anonymousJourney.contacted },
          ].map((stage) => (
            <div key={stage.label} className="rounded-sm border border-border bg-background p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wide text-muted">{stage.label}</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-foreground">{stage.count}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Part 9 — returning visitors, with one real (never fabricated) repeat-research example. */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Returning visitors — {period.label}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">New</p>
            <p className="font-mono text-xl font-semibold text-foreground">{overview.newVisitors}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Returning</p>
            <p className="font-mono text-xl font-semibold text-foreground">{overview.returningVisitors}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Returned and re-researched the same project</p>
            <p className="font-mono text-xl font-semibold text-foreground">{returningInsights.repeatResearchSessions}</p>
          </div>
        </div>
        {returningInsights.example ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-foreground">
            Real example: a visitor who first arrived via{" "}
            <span className="font-semibold">{returningInsights.example.sessionSource ? SOURCE_LABEL[returningInsights.example.sessionSource] : "an unknown source"}</span>{" "}
            returned {returningInsights.example.daysSinceFirstSeen === 0 ? "the same day" : `after ${returningInsights.example.daysSinceFirstSeen} day${returningInsights.example.daysSinceFirstSeen === 1 ? "" : "s"}`}, viewed{" "}
            {returningInsights.example.projectsViewedAgain} project{returningInsights.example.projectsViewedAgain === 1 ? "" : "s"} they had already looked at
            {returningInsights.example.didCompareAgain ? ", and used Compare again" : ""}.
          </p>
        ) : (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">No repeat-research example in this period.</p>
        )}
      </section>

      {sourceBreakdown.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Where visitors come from — {period.label}</h2>
          <p className="mb-3 text-[11px] text-muted">
            First-touch source, captured once per anonymous session the moment analytics cookies are accepted — only covers sessions since this was
            added, not full historical traffic.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                  <th className="py-1.5 font-medium text-right">Active researchers</th>
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown
                  .slice()
                  .sort((a, b) => b.sessions - a.sessions)
                  .map((row) => (
                    <tr key={row.source} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 text-foreground">{SOURCE_LABEL[row.source] ?? row.source}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                      <td className="py-1.5 text-right font-mono text-muted">{row.activeResearchers}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {acquisition.channels.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Traffic Sources — {period.label}</h2>
          <p className="mb-3 text-[11px] text-muted">
            Where your visitors discovered NoDalalTalks, grouped into channels, and which of them are actually bringing research users — not just clicks.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Channel</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Active researchers</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registration rate</th>
                  <th className="py-1.5 font-medium text-right">Researcher rate</th>
                </tr>
              </thead>
              <tbody>
                {acquisition.channels
                  .slice()
                  .sort((a, b) => b.sessions - a.sessions)
                  .map((row) => (
                    <tr key={row.channel} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 text-foreground">{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.activeResearchers}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{Math.round((row.registered / row.sessions) * 1000) / 10}%</td>
                      <td className="py-1.5 text-right font-mono text-muted">{Math.round((row.activeResearchers / row.sessions) * 1000) / 10}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {acquisition.campaigns.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-muted">UTM campaigns</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-3 font-medium">Source</th>
                      <th className="py-1.5 pr-3 font-medium">Medium</th>
                      <th className="py-1.5 pr-3 font-medium">Campaign</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                      <th className="py-1.5 font-medium text-right">Active researchers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acquisition.campaigns.map((row) => (
                      <tr key={`${row.source}::${row.campaign}`} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-3 text-foreground">{SOURCE_LABEL[row.source] ?? row.source}</td>
                        <td className="py-1.5 pr-3 text-muted">{row.medium ?? "--"}</td>
                        <td className="py-1.5 pr-3 text-muted">{row.campaign}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{row.activeResearchers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Best acquisition channel</p>
              {acquisition.insights.bestAcquisition ? (
                <p className="mt-1 text-xs text-foreground">
                  <span className="font-semibold">{CHANNEL_LABEL[acquisition.insights.bestAcquisition.channel]}</span>
                  <br />
                  {acquisition.insights.bestAcquisition.sessions} visitors → {acquisition.insights.bestAcquisition.activeResearchers} active researchers
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">Not enough data yet.</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Best conversion channel</p>
              {acquisition.insights.bestConversion ? (
                <p className="mt-1 text-xs text-foreground">
                  <span className="font-semibold">{CHANNEL_LABEL[acquisition.insights.bestConversion.channel]}</span>
                  <br />
                  {acquisition.insights.bestConversion.sessions} visitors → {acquisition.insights.bestConversion.registered} registered (
                  {Math.round(acquisition.insights.bestConversion.rate * 1000) / 10}%)
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">Not enough data yet.</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Low quality traffic</p>
              {acquisition.insights.lowQuality ? (
                <p className="mt-1 text-xs text-foreground">
                  <span className="font-semibold">{CHANNEL_LABEL[acquisition.insights.lowQuality.channel]}</span>
                  <br />
                  {acquisition.insights.lowQuality.sessions} visitors → only {acquisition.insights.lowQuality.activeResearchers} active researchers
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">Not enough data yet.</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[10px] text-muted">
            Channel groupings and insights are computed only from real sessions in this period — never invented when there isn&apos;t enough data.
          </p>
        </section>
      ) : null}

      {/* Part 5 — channel quality: not just volume, but registration/research/save/compare/contact/return rate per source. "Which channel brings the BEST users, not just the MOST." */}
      {channelQuality.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Channel quality — {period.label}</h2>
          <p className="mb-3 text-[11px] text-muted">Which channel brings the best users, not just the most.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registration</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Research</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Project view</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Save</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Compare</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Contact</th>
                  <th className="py-1.5 font-medium text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {channelQuality
                  .slice()
                  .sort((a, b) => b.sessions - a.sessions)
                  .map((row) => (
                    <tr key={row.source} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 text-foreground">{SOURCE_LABEL[row.source] ?? row.source}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registrationRate ?? "--"}%</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.researchRate ?? "--"}%</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.projectViewRate ?? "--"}%</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.saveRate ?? "--"}%</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.compareRate ?? "--"}%</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.contactRate ?? "--"}%</td>
                      <td className="py-1.5 text-right font-mono text-muted">{row.returnRate ?? "--"}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Part 6 — landing page analytics. No bounce/exit rate: not every page in this app fires a tracked event, so "no further action" can't be reliably told apart from "visited an untracked page and left satisfied." */}
      {landingPages.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Landing pages — {period.label}</h2>
          <p className="mb-3 text-[11px] text-muted">Where sessions with a known landing page first arrived (only covers sessions captured since this was added).</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Landing page</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Registration</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Research</th>
                  <th className="py-1.5 font-medium text-right">Contact</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((row) => (
                  <tr key={row.bucket} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-3 text-foreground">{row.bucket}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.sessions}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registrationRate ?? "--"}%</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.researchRate ?? "--"}%</td>
                    <td className="py-1.5 text-right font-mono text-muted">{row.contactRate ?? "--"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Part 7 — search intent by source, reusing the existing Search Analytics query pattern. */}
      {searchBySource.length > 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">What each source searches for — {period.label}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {searchBySource.map((row) => (
              <div key={row.source}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{SOURCE_LABEL[row.source] ?? row.source}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-foreground">
                  {row.topQueries.map((q) => (
                    <li key={q.query}>
                      &quot;{q.query}&quot; <span className="text-muted">({q.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Parts 10/11 — device and coarse geography, from the same first-party session-level capture as source (no fingerprinting, no precise location). */}
      <section className="rounded-sm border border-border bg-surface p-4">
        <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Devices — {period.label}</h2>
          {deviceBreakdown.coveredSessions === 0 ? (
            <p className="text-xs text-muted">Not enough data yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Device</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-foreground">
                  {deviceBreakdown.byDevice.map((d) => (
                    <li key={d.label} className="flex justify-between gap-3">
                      <span>{d.label}</span>
                      <span className="font-mono text-muted">{d.percent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">OS</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-foreground">
                  {deviceBreakdown.byOs.map((d) => (
                    <li key={d.label} className="flex justify-between gap-3">
                      <span>{d.label}</span>
                      <span className="font-mono text-muted">{d.percent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
      </section>

      {/* Phase 3C Part 11 — Founder Visitor Geo Dashboard: Countries -> Regions -> Cities, each with real visitor/registered/researcher counts (not just a percent list). Approximate visitor location, derived from Vercel's own first-party edge geo headers -- never precise coordinates, never a raw IP. */}
      {geoBreakdown.coveredSessions === 0 ? (
        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography — {period.label}</h2>
          <p className="text-xs text-muted">Not enough data yet.</p>
        </section>
      ) : (
        <>
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography — Countries — {period.label}</h2>
            <p className="mb-3 text-[11px] text-muted">Approximate visitor location (country-level) — never a precise coordinate or raw IP.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-3 font-medium">Country</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                    <th className="py-1.5 pr-3 font-medium text-right">New</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Returning</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                    <th className="py-1.5 font-medium text-right">Researchers</th>
                  </tr>
                </thead>
                <tbody>
                  {geoCountryRows.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 text-foreground">{row.label}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.visitors}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.newVisitors}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.returningVisitors}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                      <td className="py-1.5 text-right font-mono text-muted">{row.researchers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography — Regions / States — {period.label}</h2>
            {geoRegionRows.length === 0 ? (
              <p className="text-xs text-muted">Not enough data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-3 font-medium">Region / State</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                      <th className="py-1.5 font-medium text-right">Researchers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoRegionRows.map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-3 text-foreground">{row.label}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.visitors}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{row.researchers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography — Cities — {period.label}</h2>
            {geoCityRows.length === 0 ? (
              <p className="text-xs text-muted">Not enough data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-3 font-medium">City</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                      <th className="py-1.5 font-medium text-right">Researchers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoCityRows.map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-3 text-foreground">{row.label}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.visitors}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{row.researchers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Phase 3C Part 12 — geography x acquisition channel: WHERE users come from + WHICH channel brought them, for the top cities by volume only. */}
          {geoSourceRows.length > 0 ? (
            <section className="rounded-sm border border-border bg-surface p-4">
              <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography × Source — {period.label}</h2>
              <p className="mb-3 text-[11px] text-muted">Top cities by volume, broken down by acquisition channel.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-3 font-medium">City</th>
                      <th className="py-1.5 pr-3 font-medium">Source</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Visitors</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Registered</th>
                      <th className="py-1.5 font-medium text-right">Researchers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoSourceRows.map((row, i) => (
                      <tr key={`${row.location}-${row.source}`} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-3 text-foreground">
                          {i === 0 || geoSourceRows[i - 1].location !== row.location ? row.location : ""}
                        </td>
                        <td className="py-1.5 pr-3 text-muted">{SOURCE_LABEL[row.source] ?? row.source}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-foreground">{row.visitors}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-muted">{row.registered}</td>
                        <td className="py-1.5 text-right font-mono text-muted">{row.researchers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Phase 3C Part 13 — geography x behaviour: top searches/projects per location, gated by a minimum sample size per city. */}
          {geoBehaviourRows.length > 0 ? (
            <section className="rounded-sm border border-border bg-surface p-4">
              <h2 className="mb-1 font-mono text-sm font-semibold text-foreground">Geography × Behaviour — {period.label}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {geoBehaviourRows.map((row) => (
                  <div key={row.location}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {row.location} <span className="font-normal normal-case text-muted">({row.sessions} sessions)</span>
                    </p>
                    {row.topSearches.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-foreground">
                        {row.topSearches.map((q) => (
                          <li key={q.query}>
                            &quot;{q.query}&quot; <span className="text-muted">({q.count})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Not enough data yet.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <p className="text-[11px] text-muted">
        These numbers only include visitors who accepted analytics cookies on the consent banner — a decline means no
        anonymous visitor id is created for that visit, so it can&apos;t appear here.
      </p>
    </div>
  );
}
