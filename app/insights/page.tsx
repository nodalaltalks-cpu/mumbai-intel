import type { Metadata } from "next";
import { getTopLocalitiesByActivity } from "@/lib/queries";
import { formatPricePerSqft } from "@/lib/format";
import { getPublicSession } from "@/lib/public-auth/session";
import { gated, maskPricePerSqft } from "@/lib/premium/mask";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import SectionHeading from "@/app/components/ui/SectionHeading";
import EmptyState from "@/app/components/ui/EmptyState";
import BackLink from "@/app/components/ui/BackLink";

export const metadata: Metadata = {
  title: "Insights - NoDalalTalks",
  description: "How NoDalalTalks sources and verifies its data, plus the top-performing localities by market activity.",
};
export const dynamic = "force-dynamic";

const DATA_CHECK_NOTES = [
  {
    tag: "Verified Data",
    body: "Information checked against reliable public and official government RERA records.",
  },
  {
    tag: "Cross-Checked",
    body: "Important figures are reviewed against more than one source whenever possible.",
  },
  {
    tag: "Reviewed",
    body: "Our team checks the information for accuracy and consistency before it is published.",
  },
  {
    tag: "Estimated",
    body: "Some figures are calculated from available data. These are always clearly marked as estimates.",
  },
  {
    tag: "User Reported",
    body: "Information shared by users is treated as unverified until it can be independently confirmed.",
  },
];

export default async function InsightsPage() {
  const [session, topLocalities] = await Promise.all([getPublicSession(), getTopLocalitiesByActivity(10)]);
  await recordResearchEvent("INSIGHTS_VIEWED");
  const locked = session === null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6">
        <div>
          <BackLink fallbackHref="/" />
          <h1 className="mt-2 font-mono text-2xl font-bold text-foreground">Real Estate Insights</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every fact on NoDalalTalks is tagged with where it came from. No number is presented without a source you
            can check.
          </p>
        </div>

        <section>
          <SectionHeading title="Most Active Localities" subtitle="Ranked by recorded transaction volume" viewAllHref="/localities" />
          {topLocalities.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topLocalities.map((insight, i) => (
                <div key={insight.localityId} className="rounded-sm border border-border bg-surface p-4">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Rank #{i + 1}</p>
                  <h3 className="mt-1 font-mono text-sm font-semibold text-foreground">{insight.localityName}</h3>
                  <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted">Transactions</p>
                      <p className="font-mono text-sm text-foreground">{insight.transactionCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted">Avg rate</p>
                      <p className="font-mono text-sm text-foreground" title={locked ? "🔒 Sign in to unlock verified intelligence" : undefined}>
                        {gated(locked, formatPricePerSqft(insight.avgPricePerSqftPaise), maskPricePerSqft())}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No insights yet" message="Insights are computed from recorded transactions. They will appear as data is added." />
          )}
        </section>

        <section>
          <SectionHeading
            title="How We Check Our Data"
            subtitle="We use multiple reliable sources and cross-check important information before publishing it."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DATA_CHECK_NOTES.map((note) => (
              <div key={note.tag} className="rounded-sm border border-border bg-surface p-4">
                <span className="rounded-sm border border-accent/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                  {note.tag}
                </span>
                <p className="mt-2 text-xs text-muted">{note.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
