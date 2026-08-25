import JsonLd from "./components/JsonLd";
import FeaturedBuilders from "./components/FeaturedBuilders";
import FeaturedProjects from "./components/FeaturedProjects";
import Footer from "./components/Footer";
import HeroSearch from "./components/HeroSearch";
import LatestLaunches from "./components/LatestLaunches";
import LatestTransactions from "./components/LatestTransactions";
import MarketInsights from "./components/MarketInsights";
import MarketSnapshot from "./components/MarketSnapshot";
import Navbar from "./components/Navbar";
import NewestDevelopers from "./components/NewestDevelopers";
import PriceTrend from "./components/PriceTrend";
import RecentlyActiveDevelopers from "./components/RecentlyActiveDevelopers";
import TopDevelopers from "./components/TopDevelopers";
import TrendingLocalities from "./components/TrendingLocalities";
import RecommendedForYou from "./components/RecommendedForYou";
import { recordResearchEvent } from "@/lib/analytics/research-events";

// All sections below read live from Prisma — force dynamic rendering so the
// homepage never serves a stale build-time snapshot.
//
// Note: sections are intentionally NOT wrapped in per-section Suspense
// boundaries. Measured in this environment, firing all 8 sections' DB
// queries concurrently against the Neon HTTP adapter (no pooled connection,
// one HTTP round-trip per query) was consistently slower than sequential
// (16-29s vs 5.5-9s) — the serverless HTTP proxy throttles/queues bursts of
// concurrent requests rather than serving them in parallel. Sequential
// rendering measured faster and more consistent, so it's kept here.
export const dynamic = "force-dynamic";

const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "NoDalalTalks",
  description: "Real estate research intelligence for Mumbai: verified projects, developers, localities and registered transactions. No phone number required to research.",
  url: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  // The mi_ref_code cookie (set by proxy.ts) handles WHO gets attribution
  // credit at signup; this fires the click-log entry itself, independent of
  // whether that cookie was already set by an earlier visit -- every
  // referral-link visit is a real signal worth counting, not just the first.
  const { ref } = await searchParams;
  if (ref) {
    await recordResearchEvent("REFERRAL_LINK_CLICKED", { metadata: { referralCode: ref } });
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <JsonLd data={ORGANIZATION_SCHEMA} />
      <Navbar />

      <main id="main-content" className="flex-1">
        <HeroSearch />
        <FeaturedProjects />
        <RecommendedForYou surface="homepage" />
        <TrendingLocalities />
        <FeaturedBuilders />
        <TopDevelopers />
        <NewestDevelopers />
        <RecentlyActiveDevelopers />
        <LatestLaunches />
        {/* Market Snapshot moved below the project feed — search + projects are the
            first thing a new visitor sees, not a stats module. */}
        <MarketSnapshot />
        <PriceTrend />
        <LatestTransactions />
        <MarketInsights />
      </main>

      <Footer />
    </div>
  );
}
