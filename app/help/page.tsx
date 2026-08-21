import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell from "@/app/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Help Center — NoDalalTalks",
  description: "Guides for searching, filtering, reading data-source tags, and getting the most out of NoDalalTalks.",
};

export default function HelpCenterPage() {
  return (
    <LegalPageShell title="Help Center" subtitle="Guides for getting the most out of NoDalalTalks.">
      <h2>Finding a project, builder or locality</h2>
      <p>
        Use the search bar in the navigation to jump straight to a project, builder or locality by name. To browse and
        filter systematically, use the{" "}
        <Link href="/projects" className="text-accent hover:underline">
          Projects
        </Link>
        ,{" "}
        <Link href="/builders" className="text-accent hover:underline">
          Builders
        </Link>{" "}
        and{" "}
        <Link href="/localities" className="text-accent hover:underline">
          Localities
        </Link>{" "}
        pages, each with filters for status, category, price range, possession timeline and more. Filter combinations
        can be saved for quick reuse.
      </p>

      <h2>Reading data-source tags</h2>
      <p>
        Every figure on the platform is labeled with a small uppercase tag — GOVT VERIFIED, BUILDER DATA, ANALYST
        VERIFIED, ESTIMATED, or COMMUNITY — plus a confidence level. Hover or check nearby text for context on how a
        number was derived before relying on it for a decision.
      </p>

      <h2>Using the Transactions database</h2>
      <p>
        The{" "}
        <Link href="/transactions" className="text-accent hover:underline">
          Transactions
        </Link>{" "}
        page lists registered sale/resale/lease records with filters for locality, project, price range and
        configuration. Each project and locality page also shows its own transaction history and price trend charts.
      </p>

      <h2>Using the Map</h2>
      <p>
        The{" "}
        <Link href="/map" className="text-accent hover:underline">
          Map
        </Link>{" "}
        view plots projects geographically with the same filters available on the Projects page, useful for
        location-first search (e.g. proximity to a specific area or landmark).
      </p>

      <h2>Market Data and Insights</h2>
      <p>
        <Link href="/market-data" className="text-accent hover:underline">
          Market Data
        </Link>{" "}
        summarizes citywide price trends, locality snapshots and builder activity.{" "}
        <Link href="/insights" className="text-accent hover:underline">
          Insights
        </Link>{" "}
        explains how our figures are derived and highlights top-performing localities.
      </p>

      <h2>Saving projects</h2>
      <p>
        Sign in and use the Save button on a project&apos;s detail page to bookmark it. Saved projects appear on your{" "}
        <Link href="/account" className="text-accent hover:underline">
          Account
        </Link>{" "}
        page.
      </p>

      <h2>Still stuck?</h2>
      <p>
        Check the{" "}
        <Link href="/faq" className="text-accent hover:underline">
          FAQ
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="text-accent hover:underline">
          contact us
        </Link>{" "}
        directly.
      </p>
    </LegalPageShell>
  );
}
