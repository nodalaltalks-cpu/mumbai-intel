import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLocalitiesForBuilder,
  getPublicBuilderBySlug,
  getPublicTransactionsPaged,
  getTransactionMonthlyTrend,
  getTransactionStats,
} from "@/lib/queries";
import { formatDate, formatPaise, formatPricePerSqft } from "@/lib/format";
import { AMENITY_CATEGORY_LABEL, SOURCE_CLASS, SOURCE_LABEL, STATUS_LABEL, type AmenityCategoryValue, type ProjectStatus } from "@/lib/project-meta";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import ProjectCard from "@/app/components/ProjectCard";
import LocalityCard from "@/app/components/LocalityCard";
import TransactionTable from "@/app/components/TransactionTable";
import { LabeledDistributionBars, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import EmptyState from "@/app/components/ui/EmptyState";
import { Fact, StatCard } from "@/app/components/ui/StatCard";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import WishlistButton from "@/app/components/WishlistButton";
import ShareButton from "@/app/components/ShareButton";
import ReportIssueButton from "@/app/components/ReportIssueButton";
import { isWishlisted } from "@/lib/actions/wishlist";
import { recordRecentViewAction } from "@/lib/actions/recent-views";
import { getPublicSession } from "@/lib/public-auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const builder = await getPublicBuilderBySlug(slug);
  if (!builder) return { title: "Developer not found — NoDalalTalks" };
  const title = builder.metaTitle || `${builder.name} — NoDalalTalks`;
  const description = builder.metaDescription || undefined;
  const image = builder.ogImageUrl || builder.coverImageUrl || undefined;
  return {
    title,
    description,
    alternates: { canonical: `/builders/${builder.slug}` },
    openGraph: { title, description, type: "website", images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "statistics", label: "Statistics" },
  { id: "presence", label: "Market Presence" },
  { id: "analytics", label: "Analytics" },
  { id: "projects", label: "Projects" },
  { id: "localities", label: "Localities" },
  { id: "transactions", label: "Transactions" },
  { id: "gallery", label: "Gallery" },
];

export default async function BuilderDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const builder = await getPublicBuilderBySlug(slug);
  if (!builder) notFound();

  await recordRecentViewAction("Builder", builder.id);

  const latestScore = builder.scoreSnapshots[0] ?? null;
  const filters = { builderId: builder.id };

  const [{ items: recentTransactions }, relatedLocalities, txStats, monthlyTrend, isSaved, publicSession] = await Promise.all([
    getPublicTransactionsPaged({ ...filters, pageSize: 6 }),
    getLocalitiesForBuilder(builder.id, 4),
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    isWishlisted("Builder", builder.id),
    getPublicSession(),
  ]);

  const projectsByCityBars = builder.citiesServed.map((c) => ({ label: c.cityName, count: c.projectCount }));
  const projectsByStatusBars = builder.projectsByStatus.map((s) => ({ label: STATUS_LABEL[s.status as ProjectStatus], count: s.count }));
  const timelineProjects = [...builder.projects].sort(
    (a, b) => (a.launchDate ?? a.possessionDate ?? new Date(0)).getTime() - (b.launchDate ?? b.possessionDate ?? new Date(0)).getTime()
  );

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Developers", href: "/builders" }, { label: builder.name }]} />

      {builder.coverImageUrl ? (
        <div className="relative h-40 w-full overflow-hidden sm:h-56">
          <Image src={builder.coverImageUrl} alt={`${builder.name} cover`} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>
      ) : null}

      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-6 px-4 py-8 sm:px-6">
          {builder.logoUrl ? (
            <Image src={builder.logoUrl} alt={builder.name} width={80} height={80} className="h-20 w-20 rounded-sm border border-border object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-sm border border-border bg-background">
              <span className="font-mono text-2xl font-bold text-border">{builder.name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${SOURCE_CLASS[builder.dataSource]}`}>
                {SOURCE_LABEL[builder.dataSource]}
              </span>
              <WishlistButton entityType="Builder" entityId={builder.id} initialSaved={isSaved} />
              <ShareButton title={builder.name} text={`Check out ${builder.name} on NoDalalTalks`} />
            </div>
            <h1 className="mt-2 font-mono text-2xl font-bold text-foreground">{builder.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {builder.headquarters ?? "Headquarters not specified"}
              {builder.foundedYear ? ` · Founded ${builder.foundedYear}` : ""}
              {builder.yearsInBusiness !== null ? ` · ${builder.yearsInBusiness} yrs in business` : ""}
            </p>
            {builder.websiteUrl ? (
              <a href={builder.websiteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
                {builder.websiteUrl}
              </a>
            ) : null}
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">Rating</p>
              <p className="font-mono text-2xl text-accent">{latestScore ? latestScore.overallScore.toFixed(1) : "--"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">Investment score</p>
              <p className="font-mono text-2xl text-foreground">{builder.investmentScore !== null ? builder.investmentScore.toFixed(1) : "--"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">Projects</p>
              <p className="font-mono text-2xl text-foreground">{builder.projects.length}</p>
            </div>
          </div>
        </div>
      </div>

      <nav className="sticky top-[57px] z-40 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl gap-4 py-2.5">
          {NAV_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-xs uppercase tracking-wide text-muted hover:text-accent">
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        {/* Company Overview */}
        <section id="overview" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Company Overview</h2>
          {builder.description ? (
            <div
              className="prose-invert mt-2 max-w-3xl text-sm text-foreground [&_a]:text-accent [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: builder.description }}
            />
          ) : (
            <p className="mt-3 text-sm text-muted">No description added yet.</p>
          )}
        </section>

        {builder.legalNames.length > 0 ? (
          <section>
            <h2 className="font-mono text-lg font-semibold text-foreground">Legal Entities</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {builder.legalNames.map((name, i) => (
                <li key={i} className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-foreground">
                  {name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {builder.awards.length > 0 ? (
          <section>
            <h2 className="font-mono text-lg font-semibold text-foreground">Awards &amp; Recognition</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {builder.awards.map((award, i) => (
                <li key={i} className="text-sm text-foreground">
                  🏆 {award}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Timeline</h2>
          {builder.timeline.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-2 border-l border-border pl-4">
              {builder.timeline.map((event) => (
                <li key={event.id}>
                  <p className="font-mono text-xs text-foreground">
                    <span className="text-accent">{event.year}</span> — {event.title}
                  </p>
                  {event.description ? <p className="text-xs text-muted">{event.description}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">No timeline published yet.</p>
          )}
        </section>

        {/* Key Statistics */}
        <section id="statistics" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Key Statistics</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
            <Fact label="RERA number" value={builder.reraNumber ?? "--"} />
            <Fact label="Delivered" value={builder.completedProjects.length} />
            <Fact label="Under construction" value={builder.underConstructionProjects.length} />
            <Fact label="Upcoming" value={builder.upcomingProjects.length} />
            <Fact
              label="On-time delivery"
              value={latestScore?.onTimeDeliveryPct !== null && latestScore?.onTimeDeliveryPct !== undefined ? `${latestScore.onTimeDeliveryPct}%` : "--"}
            />
            <Fact label="Years in business" value={builder.yearsInBusiness ?? "--"} />
            <Fact label="Cities served" value={builder.citiesServed.length} />
            <Fact label="Investment score" value={builder.investmentScore !== null ? `${builder.investmentScore}/10` : "--"} accent />
          </div>
        </section>

        {builder.scoreSnapshots.length > 0 ? (
          <section>
            <h2 className="font-mono text-lg font-semibold text-foreground">Trust Score History</h2>
            <div className="mt-3 overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">As of</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">On-time delivery</th>
                    <th className="px-3 py-2 font-medium">Delivered</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {builder.scoreSnapshots.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-muted">{formatDate(s.asOf)}</td>
                      <td className="px-3 py-2 font-mono text-accent">{s.overallScore.toFixed(1)}</td>
                      <td className="px-3 py-2 text-foreground">{s.onTimeDeliveryPct !== null ? `${s.onTimeDeliveryPct}%` : "--"}</td>
                      <td className="px-3 py-2 text-foreground">{s.deliveredProjects}</td>
                      <td className="px-3 py-2 text-foreground">{s.activeProjects}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Market Presence */}
        <section id="presence" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Market Presence</h2>
          <p className="mt-1 text-xs text-muted">Cities served and price positioning across {builder.name}&apos;s portfolio</p>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Cities Served</p>
              <div className="mt-3">
                <LabeledDistributionBars buckets={projectsByCityBars} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Price Distribution</p>
              <div className="mt-3">
                <LabeledDistributionBars buckets={builder.priceDistribution} />
              </div>
            </div>
          </div>
        </section>

        {/* Developer Analytics */}
        <section id="analytics" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Developer Analytics</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total transactions" value={String(txStats.totalTransactions)} size="md" />
            <StatCard label="Average price" value={formatPaise(txStats.avgPricePaise)} size="md" />
            <StatCard label="Avg ₹/sqft" value={formatPricePerSqft(txStats.avgPricePerSqftPaise)} size="md" />
            <StatCard label="Sales volume" value={formatPaise(txStats.totalSalesVolumePaise)} size="md" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Projects by Status</p>
              <div className="mt-3">
                <LabeledDistributionBars buckets={projectsByStatusBars} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Transaction Volume (Monthly)</p>
              <div className="mt-3">
                <TransactionVolumeChart points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Average Price Trend</p>
              <div className="mt-3">
                <TransactionLineChart
                  points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePaise }))}
                  ariaLabel="Average transaction price trend"
                />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Sales Volume Trend</p>
              <div className="mt-3">
                <TransactionLineChart
                  points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.totalValuePaise }))}
                  ariaLabel="Monthly sales volume"
                />
              </div>
            </div>
          </div>

          {timelineProjects.length > 0 ? (
            <div className="mt-4 rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Project Timeline</p>
              <ol className="mt-3 flex flex-col gap-2 border-l border-border pl-4">
                {timelineProjects.map((p) => (
                  <li key={p.id}>
                    <p className="font-mono text-xs text-foreground">
                      <span className="text-accent">{p.launchDate ? formatDate(p.launchDate) : "Date TBD"}</span> — {p.name}
                      <span className="ml-2 text-muted">({STATUS_LABEL[p.status as ProjectStatus]})</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        {builder.amenities.length > 0 ? (
          <section>
            <h2 className="font-mono text-lg font-semibold text-foreground">Amenities</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(
                builder.amenities.reduce<Record<string, string[]>>((acc, ba) => {
                  (acc[ba.amenity.category] ??= []).push(ba.amenity.name);
                  return acc;
                }, {})
              ).map(([category, names]) => (
                <div key={category} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{AMENITY_CATEGORY_LABEL[category as AmenityCategoryValue]}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {names.map((name, i) => (
                      <li key={i} className="text-xs text-foreground">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Projects split by status */}
        <section id="projects" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Completed Projects</h2>
          {builder.completedProjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {builder.completedProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No completed projects yet.</p>
          )}
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Under Construction Projects</h2>
          {builder.underConstructionProjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {builder.underConstructionProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No projects currently under construction.</p>
          )}
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Upcoming Projects</h2>
          {builder.upcomingProjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {builder.upcomingProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No upcoming projects announced yet.</p>
          )}
        </section>

        {/* Related Localities */}
        <section id="localities" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Related Localities</h2>
          {relatedLocalities.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedLocalities.map((l) => (
                <LocalityCard key={l.id} locality={l} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No published localities linked yet.</p>
          )}
        </section>

        {/* Recent Transactions */}
        <section id="transactions" className="scroll-mt-32">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-lg font-semibold text-foreground">Recent Transactions</h2>
            {recentTransactions.length > 0 ? (
              <Link href={`/transactions?builder=${builder.id}`} className="text-xs text-muted hover:text-accent">
                View all →
              </Link>
            ) : null}
          </div>
          {recentTransactions.length > 0 ? (
            <div className="mt-3">
              <TransactionTable transactions={recentTransactions} />
            </div>
          ) : (
            <EmptyState className="mt-3" title="No transactions yet" message="Registered transactions for this developer will appear here." />
          )}
        </section>

        {/* Gallery */}
        <section id="gallery" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Gallery</h2>
          {builder.images.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {builder.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? ""} className="aspect-[4/3] w-full rounded-sm border border-border object-cover" />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No gallery images uploaded yet.</p>
          )}
        </section>

        <div className="flex items-center justify-between">
          <Link href="/builders" className="text-xs text-muted hover:text-accent">
            ← Back to all developers
          </Link>
          <ReportIssueButton entityType="Builder" entityName={builder.name} loggedIn={publicSession !== null} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

