import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";

export const metadata: Metadata = {
  title: "About — Mumbai Intel",
  description: "Mumbai Intel is a real estate market intelligence platform for Mumbai — every price, project and locality figure tagged with its data source and confidence level.",
};

export default function AboutPage() {
  return (
    <LegalPageShell title="About Mumbai Intel" subtitle="Real estate market intelligence for Mumbai, built on provenance.">
      <p>
        Mumbai Intel is a real estate market intelligence platform covering Mumbai&apos;s residential and commercial
        project landscape — developers, localities, live inventory, and registered transactions, all in one place.
      </p>

      <h2>Why provenance is the whole point</h2>
      <p>
        Most property listing sites blend verified facts, builder marketing copy, and rough estimates into a single
        undifferentiated feed. Mumbai Intel doesn&apos;t. Every figure on this platform — a price, a possession date, a
        builder&apos;s track record, a locality&apos;s growth rate — carries a visible data source (government records,
        builder-supplied information, analyst verification, AI estimate, or community submission) and a confidence
        level. Nothing renders on screen whose origin can&apos;t be named.
      </p>

      <h2>What&apos;s on the platform today</h2>
      <ul>
        <li>Project, builder and locality profiles with sourced pricing, configuration and construction-status data</li>
        <li>A registered-transaction database with price trends, configuration mix and volume analytics</li>
        <li>An interactive map to explore inventory by location, price band and status</li>
        <li>Market Data and Insights views summarizing city- and locality-level trends</li>
      </ul>

      <h2>Where the data comes from today, and where it&apos;s headed</h2>
      <p>
        Transaction and market data is currently curated manually by our analysts. The underlying schema is built so
        that automated ingestion from official sources — such as the Maharashtra Inspector General of Registration
        (IGR) — can be added later without changing how any existing figure is displayed or interpreted; only the
        recorded data source changes.
      </p>

      <h2>Mumbai first</h2>
      <p>
        We&apos;re deliberately starting with Mumbai and going deep rather than launching shallow across many cities.
        The platform&apos;s data model already supports additional cities; expansion will follow once Mumbai coverage is
        strong.
      </p>
    </LegalPageShell>
  );
}
