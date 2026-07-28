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
  description: "Real estate research intelligence for Mumbai — verified projects, developers, localities and registered transactions. Zero spam calls, zero brokerage.",
  url: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000",
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <JsonLd data={ORGANIZATION_SCHEMA} />
      <Navbar />

      <main id="main-content" className="flex-1">
        <HeroSearch />
        <MarketSnapshot />
        <FeaturedProjects />
        <TrendingLocalities />
        <FeaturedBuilders />
        <TopDevelopers />
        <NewestDevelopers />
        <RecentlyActiveDevelopers />
        <LatestLaunches />
        <PriceTrend />
        <LatestTransactions />
        <MarketInsights />
      </main>

      <Footer />
    </div>
  );
}
