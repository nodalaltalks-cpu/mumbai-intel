import type { Metadata } from "next";
import Link from "next/link";
import { getPublicBuildersPaged, getPublicLocalitiesPaged, getPublicProjectsPaged } from "@/lib/queries";
import { formatPricePerSqft } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import SectionHeading from "@/app/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Reports — Mumbai Intel",
  description: "Market and transaction reports covering Mumbai real estate activity, pricing and trends.",
};
export const dynamic = "force-dynamic";

const REPORT_CATEGORIES = [
  { title: "Market Report", href: "/reports/market", description: "City-wide KPIs, price trend and rankings." },
  { title: "Transaction Report", href: "/reports/transactions", description: "Aggregate registered-transaction activity across the market." },
];

export default async function ReportsHubPage() {
  const [localities, projects, builders] = await Promise.all([
    getPublicLocalitiesPaged({ pageSize: 8, sortBy: "price_desc" }),
    getPublicProjectsPaged({ pageSize: 8 }),
    getPublicBuildersPaged({ pageSize: 8, sortBy: "projects_desc" }),
  ]);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted">
            Premium market-intelligence reports — market summary, KPIs, charts, trends, comparisons and related entities, all generated from live data.
          </p>
        </div>

        <section>
          <SectionHeading title="Market-Wide Reports" subtitle="Aggregate views across the whole Mumbai market" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {REPORT_CATEGORIES.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface p-5 transition-colors hover:border-accent/50 hover:bg-surface-raised"
              >
                <h3 className="font-mono text-base font-semibold text-foreground">{c.title}</h3>
                <p className="text-xs text-muted">{c.description}</p>
                <span className="mt-2 text-xs text-accent">Open report →</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeading title="Area Reports" subtitle="Pick a locality for a full market-intelligence deep-dive" viewAllHref="/localities" />
          {localities.items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {localities.items.map((l) => (
                <Link
                  key={l.id}
                  href={`/reports/areas/${l.slug}`}
                  className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3 transition-colors hover:border-accent/50 hover:bg-surface-raised"
                >
                  <span className="truncate font-mono text-sm text-foreground">{l.name}</span>
                  <span className="text-[11px] text-muted">{formatPricePerSqft(l.avgPricePerSqftPaise)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No published localities yet.</p>
          )}
        </section>

        <section>
          <SectionHeading title="Project Reports" subtitle="Pick a project for a full performance report" viewAllHref="/projects" />
          {projects.items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {projects.items.map((p) => (
                <Link
                  key={p.id}
                  href={`/reports/projects/${p.slug}`}
                  className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3 transition-colors hover:border-accent/50 hover:bg-surface-raised"
                >
                  <span className="truncate font-mono text-sm text-foreground">{p.name}</span>
                  <span className="truncate text-[11px] text-muted">{p.localityName}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No published projects yet.</p>
          )}
        </section>

        <section>
          <SectionHeading title="Developer Reports" subtitle="Pick a developer for a full portfolio report" viewAllHref="/builders" />
          {builders.items.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {builders.items.map((b) => (
                <Link
                  key={b.id}
                  href={`/reports/developers/${b.slug}`}
                  className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-3 transition-colors hover:border-accent/50 hover:bg-surface-raised"
                >
                  <span className="truncate font-mono text-sm text-foreground">{b.name}</span>
                  <span className="text-[11px] text-muted">{b.projectCount} projects</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No published developers yet.</p>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
