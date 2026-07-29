import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";

export const metadata: Metadata = {
  title: "About — NoDalalTalks",
  description: "NoDalalTalks is a real estate research intelligence platform for Mumbai — zero spam calls, zero brokerage, every price, project and locality figure tagged with its data source and confidence level.",
};

export default function AboutPage() {
  return (
    <LegalPageShell title="About NoDalalTalks" subtitle="Real estate research intelligence for Mumbai — no brokerage, no spam calls.">
      <p>
        NoDalalTalks is a real estate research intelligence platform covering Mumbai&apos;s residential and commercial
        project landscape — developers, localities, live inventory, and registered transactions, all in one place, so
        you can research a project before anyone tries to sell it to you.
      </p>

      <h2>What we are — and what we&apos;re not</h2>
      <p>
        We do not sell properties. We do not operate as brokers. We do not spam users with sales calls or share your
        number with developers. NoDalalTalks exists to help buyers research projects — verified pricing, builder
        track records, locality data and registered transactions — before making a decision, not to generate leads
        for anyone.
      </p>

      <h2>Why we always show our sources</h2>
      <p>
        Most property listing sites mix verified facts, builder marketing, and rough guesses into one feed with no
        way to tell them apart. NoDalalTalks doesn&apos;t. Every figure on this platform — a price, a possession date, a
        builder&apos;s track record, a locality&apos;s growth rate — comes labeled with where it came from (government
        records, the builder, our own analysts, an estimate, or a community submission) and how confident we are in
        it. We never show you a number without telling you where it came from.
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
