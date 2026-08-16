import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLocalityIntelligence,
  getNearbyLocalities,
  getPublicLocalityBySlug,
  getPublicTransactionsPaged,
  getTopBuildersForLocality,
  getTransactionConfigurationDistribution,
  getTransactionMonthlyTrend,
  getTransactionPropertyTypeDistribution,
  getTransactionStats,
  type PublicTransactionFilters,
} from "@/lib/queries";
import { getLocalityNearbyInfra, getLocalityPriceTrend } from "@/lib/admin-queries";
import { formatMonth, formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import { AMENITY_CATEGORY_LABEL, INFRA_TYPE_LABEL, type AmenityCategoryValue, type InfraTypeValue } from "@/lib/project-meta";
import JsonLd from "@/app/components/JsonLd";
import GAPageEvent from "@/app/components/analytics/GAPageEvent";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import LocalityCard from "@/app/components/LocalityCard";
import MapEmbed from "@/app/admin/components/MapEmbed";
import TransactionTable from "@/app/components/TransactionTable";
import PremiumGate from "@/app/components/premium/PremiumGate";
import { gated, maskPercent, maskPricePerSqft, maskProjectBrochure, maskScore } from "@/lib/premium/mask";
import LocalityFilters from "@/app/components/LocalityFilters";
import LocalityMarketSnapshot from "@/app/components/LocalityMarketSnapshot";
import LocalityIntelligencePanel from "@/app/components/LocalityIntelligencePanel";
import { ConfigurationDistribution, PropertyTypeDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import Pagination from "@/app/admin/components/Pagination";
import EmptyState from "@/app/components/ui/EmptyState";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import { Fact } from "@/app/components/ui/StatCard";
import WishlistButton from "@/app/components/WishlistButton";
import ShareButton from "@/app/components/ShareButton";
import ReportIssueButton from "@/app/components/ReportIssueButton";
import { isWishlisted } from "@/lib/actions/wishlist";
import { recordRecentViewAction } from "@/lib/actions/recent-views";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { getPublicSession } from "@/lib/public-auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locality = await getPublicLocalityBySlug(slug);
  if (!locality) return { title: "Locality not found — NoDalalTalks" };
  const title = locality.metaTitle || `${locality.name} — NoDalalTalks`;
  const description = locality.metaDescription || undefined;
  const image = locality.ogImageUrl || locality.coverImageUrl || undefined;
  return {
    title,
    description,
    alternates: { canonical: locality.canonicalUrl || `/localities/${locality.slug}` },
    openGraph: { title, description, type: "website", images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "market", label: "Market" },
  { id: "charts", label: "Charts" },
  { id: "intelligence", label: "Intelligence" },
  { id: "transactions", label: "Transactions" },
  { id: "projects", label: "Projects" },
  { id: "builders", label: "Builders" },
  { id: "nearby-localities", label: "Nearby Areas" },
  { id: "nearby", label: "Nearby" },
  { id: "location", label: "Location" },
  { id: "insights", label: "Insights" },
  { id: "gallery", label: "Gallery" },
];

interface LocalitySearchParams {
  dateFrom?: string;
  dateTo?: string;
  bedrooms?: string;
  category?: string;
  type?: string;
  page?: string;
}

export default async function LocalityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<LocalitySearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const locality = await getPublicLocalityBySlug(slug);
  if (!locality) notFound();

  await recordRecentViewAction("Locality", locality.id);
  await recordResearchEvent("LOCALITY_VIEWED", { entityType: "Locality", entityId: locality.id });

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters: PublicTransactionFilters = {
    localityId: locality.id,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    bedrooms: sp.bedrooms,
    category: sp.category,
    type: sp.type,
  };

  const [
    stats,
    monthlyTrend,
    propertyTypes,
    configurations,
    topBuilders,
    nearbyLocalities,
    intelligence,
    { items: transactions, total: totalTransactions, totalPages },
    priceTrend,
    nearbyInfra,
    isSaved,
    publicSession,
  ] = await Promise.all([
    getTransactionStats(filters),
    getTransactionMonthlyTrend(filters, 12),
    getTransactionPropertyTypeDistribution(filters),
    getTransactionConfigurationDistribution(filters),
    getTopBuildersForLocality(locality.id, 4),
    getNearbyLocalities(locality.id, 4),
    getLocalityIntelligence(locality.id, locality.name, locality.investmentScore, locality.rentalYieldPercent, locality.growthPercentYoy),
    getPublicTransactionsPaged({ ...filters, page, pageSize: 10 }),
    getLocalityPriceTrend(locality.id),
    getLocalityNearbyInfra(locality.id),
    isWishlisted("Locality", locality.id),
    getPublicSession(),
  ]);
  const locked = publicSession === null;
  const next = `/localities/${locality.slug}`;

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key === "page") continue;
      if (value) qs.set(key, value);
    }
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/localities/${slug}?${qsString}#transactions` : `/localities/${slug}#transactions`;
  }

  const nearbyByType = nearbyInfra.reduce<Record<string, typeof nearbyInfra>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});
  const airport = nearbyInfra.find((i) => i.type === "AIRPORT");
  const topProjects = locality.projects.slice(0, 6);

  const placeSchema = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: locality.name,
    description: locality.metaDescription || undefined,
    url: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/localities/${locality.slug}`,
    image: locality.ogImageUrl || locality.coverImageUrl || undefined,
    geo:
      locality.centroidLat !== null && locality.centroidLng !== null
        ? { "@type": "GeoCoordinates", latitude: locality.centroidLat, longitude: locality.centroidLng }
        : undefined,
    address: { "@type": "PostalAddress", addressLocality: locality.name, addressRegion: "Maharashtra", addressCountry: "IN" },
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <JsonLd data={placeSchema} />
      <GAPageEvent event="locality_viewed" params={{ locality_id: locality.id, locality_name: locality.name }} />
      <Navbar />

      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Localities", href: "/localities" }, { label: locality.name }]} />

      {/* Hero */}
      <div className="relative h-[36vh] min-h-[260px] w-full overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
        {locality.coverImageUrl ? (
          <Image src={locality.coverImageUrl} alt={locality.name} fill priority sizes="100vw" className="object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {locality.isFeatured ? (
              <span className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">Featured</span>
            ) : null}
            <WishlistButton entityType="Locality" entityId={locality.id} initialSaved={isSaved} />
            <ShareButton title={locality.name} text={`Check out ${locality.name} on NoDalalTalks`} />
          </div>
          <h1 className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">{locality.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {locality.zone ? locality.zone.name : ""}
            {locality.zone ? " · " : ""}
            {locality.city.name}
            {locality.microMarkets.length > 0 ? ` · ${locality.microMarkets.map((m) => m.name).join(", ")}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Avg price</p>
              <p className="font-mono text-xl text-accent">{gated(locked, formatPricePerSqft(locality.avgPricePerSqftPaise), maskPricePerSqft())}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">YoY growth</p>
              <p className="font-mono text-xl text-foreground">{gated(locked, formatSignedPercent(locality.growthPercentYoy), maskPercent())}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Projects</p>
              <p className="font-mono text-xl text-foreground">{locality.projects.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky in-page nav */}
      <nav className="sticky top-[57px] z-40 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl gap-4 py-2.5">
          {NAV_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 text-xs uppercase tracking-wide text-muted hover:text-accent">
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Filters */}
      <LocalityFilters />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        {/* Overview */}
        <section id="overview" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Overview</h2>
          {locality.description ? (
            <div
              className="prose-invert mt-3 text-sm text-foreground [&_a]:text-accent [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: locality.description }}
            />
          ) : (
            <p className="mt-3 text-sm text-muted">No description added yet.</p>
          )}
          {locality.connectivityNotes ? (
            <div className="mt-4 rounded-sm border border-border bg-surface p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted">Connectivity</p>
              <p className="mt-1 text-sm text-foreground">{locality.connectivityNotes}</p>
            </div>
          ) : null}
        </section>

        {/* Market Snapshot */}
        <section id="market" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Market Snapshot</h2>
          <p className="mt-1 text-xs text-muted">Pincode {locality.pincode ?? "--"} · reflects the filters above</p>
          <div className="mt-3">
            <PremiumGate locked={locked} feature="locality-analytics" next={next}>
              <LocalityMarketSnapshot
                stats={stats}
                avgPricePerSqftPaise={locality.avgPricePerSqftPaise !== null ? Number(locality.avgPricePerSqftPaise) : null}
                rentalYieldPercent={locality.rentalYieldPercent}
                growthPercentYoy={locality.growthPercentYoy}
                locked={locked}
              />
            </PremiumGate>
          </div>
        </section>

        {/* Charts */}
        <section id="charts" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Charts</h2>
          <PremiumGate locked={locked} feature="market-analytics" next={next} className="mt-3">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Price Trend</p>
                <div className="mt-3">
                  <TransactionLineChart
                    points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePerSqftPaise }))}
                    ariaLabel="Monthly average price per square foot"
                  />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Monthly Transaction Trend</p>
                <div className="mt-3">
                  <TransactionVolumeChart points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Sales Volume Trend</p>
                <div className="mt-3">
                  <TransactionLineChart
                    points={locked ? [] : monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.totalValuePaise }))}
                    ariaLabel="Monthly total sales volume"
                  />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-muted">Property Type Distribution</p>
                <div className="mt-3">
                  <PropertyTypeDistribution buckets={locked ? [] : propertyTypes} />
                </div>
              </div>
            </div>
          </PremiumGate>
        </section>

        {/* Market Intelligence */}
        <section id="intelligence" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Market Intelligence</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PremiumGate locked={locked} feature="locality-analytics" next={next}>
                <LocalityIntelligencePanel intelligence={intelligence} locked={locked} />
              </PremiumGate>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Popular Configurations</p>
              <div className="mt-3">
                <ConfigurationDistribution buckets={configurations} />
              </div>
            </div>
          </div>
        </section>

        {/* Transactions */}
        <section id="transactions" className="scroll-mt-32">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-lg font-semibold text-foreground">
              {totalTransactions} Transaction{totalTransactions === 1 ? "" : "s"}
            </h2>
            {totalTransactions > 0 ? (
              <Link href={`/transactions?locality=${locality.id}`} className="text-xs text-muted hover:text-accent">
                Open in Transactions →
              </Link>
            ) : null}
          </div>
          {transactions.length > 0 ? (
            <div className="mt-3 flex flex-col gap-4">
              <PremiumGate locked={locked} feature="transaction-history" next={`/localities/${locality.slug}`}>
                <TransactionTable transactions={transactions} locked={locked} />
              </PremiumGate>
              <Pagination page={page} totalPages={totalPages} total={totalTransactions} buildHref={buildHref} />
            </div>
          ) : (
            <EmptyState
              className="mt-3"
              title="No transactions match these filters"
              message="Try widening the date range or resetting the filters above."
            />
          )}
        </section>

        {/* Curated Price Trend */}
        <section className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Curated Price Trend</h2>
          <p className="mt-1 text-xs text-muted">Analyst-verified monthly average, independent of the filters above</p>
          {priceTrend.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium text-right">Avg ₹/sqft</th>
                  </tr>
                </thead>
                <tbody>
                  {priceTrend.map((point, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-foreground">{formatMonth(point.month)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatPricePerSqft(point.avgPricePerSqftPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No curated price history recorded yet.</p>
          )}
        </section>

        {/* Top Projects */}
        <section id="projects" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Top Projects in {locality.name}</h2>
          {topProjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topProjects.map((p) => (
                <ProjectCard key={p.id} project={maskProjectBrochure(p, locked)} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No published projects yet.</p>
          )}
        </section>

        {/* Top Builders */}
        <section id="builders" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Top Builders in {locality.name}</h2>
          {topBuilders.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {topBuilders.map((b) => (
                <BuilderCard
                  key={b.slug}
                  builder={{ slug: b.slug, name: b.name, logoUrl: b.logoUrl, overallScore: b.score, projectCount: b.projectCount }}
                  locked={locked}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No builder data yet.</p>
          )}
        </section>

        {/* Nearby Localities */}
        <section id="nearby-localities" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Nearby Areas</h2>
          {nearbyLocalities.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {nearbyLocalities.map((l) => (
                <LocalityCard key={l.id} locality={l} locked={locked} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No nearby areas published yet.</p>
          )}
        </section>

        {/* Nearby Infrastructure */}
        <section id="nearby" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Nearby Infrastructure</h2>
          {airport ? (
            <p className="mt-1 text-xs text-muted">
              Nearest airport: <span className="text-foreground">{airport.name}</span> ({(airport.distanceMeters / 1000).toFixed(1)} km)
            </p>
          ) : null}
          {Object.keys(nearbyByType).length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(nearbyByType).map(([type, items]) => (
                <div key={type} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{INFRA_TYPE_LABEL[type as InfraTypeValue]}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between text-xs text-foreground">
                        <span>{item.name}</span>
                        <span className="font-mono text-muted">
                          {item.distanceMeters < 1000 ? `${item.distanceMeters}m` : `${(item.distanceMeters / 1000).toFixed(1)}km`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No nearby infrastructure catalogued yet.</p>
          )}
          {nearbyInfra.some((item) => item.dataSource === "EXTERNAL_OPEN_DATA") ? (
            <p className="mt-3 text-[10px] text-muted">
              Includes data © <a href="https://www.openstreetmap.org/copyright" className="underline hover:text-foreground">OpenStreetMap</a> contributors, ODbL.
            </p>
          ) : null}
        </section>

        {/* Map */}
        <section id="location" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Location</h2>
          <div className="mt-3">
            <MapEmbed latitude={locality.centroidLat} longitude={locality.centroidLng} />
          </div>
        </section>

        {/* Market Insights */}
        <section id="insights" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Market Insights</h2>
          <PremiumGate locked={locked} feature="locality-analytics" next={next} className="mt-3">
            <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
              <Fact label="Investment score" value={gated(locked, locality.investmentScore !== null ? `${locality.investmentScore}/10` : "--", maskScore())} accent />
              <Fact label="End-user score" value={gated(locked, locality.endUserScore !== null ? `${locality.endUserScore}/10` : "--", maskScore())} />
              <Fact label="Luxury score" value={gated(locked, locality.luxuryScore !== null ? `${locality.luxuryScore}/10` : "--", maskScore())} />
              <Fact label="Family score" value={gated(locked, locality.familyScore !== null ? `${locality.familyScore}/10` : "--", maskScore())} />
            </div>
          </PremiumGate>

          {locality.advantages.length > 0 || locality.disadvantages.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {locality.advantages.length > 0 ? (
                <div className="rounded-sm border border-positive/30 bg-positive/5 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-positive">Advantages</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {locality.advantages.map((a, i) => (
                      <li key={i} className="text-xs text-foreground">
                        + {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {locality.disadvantages.length > 0 ? (
                <div className="rounded-sm border border-negative/30 bg-negative/5 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-negative">Disadvantages</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {locality.disadvantages.map((d, i) => (
                      <li key={i} className="text-xs text-foreground">
                        − {d}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {locality.amenities.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(
                locality.amenities.reduce<Record<string, string[]>>((acc, la) => {
                  (acc[la.amenity.category] ??= []).push(la.amenity.name);
                  return acc;
                }, {})
              ).map(([category, names]) => (
                <div key={category} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{AMENITY_CATEGORY_LABEL[category as AmenityCategoryValue] ?? category}</p>
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
          ) : null}
        </section>

        {/* Gallery */}
        <section id="gallery" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Gallery</h2>
          {locality.images.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {locality.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? ""} className="aspect-[4/3] w-full rounded-sm border border-border object-cover" />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No gallery images uploaded yet.</p>
          )}
        </section>

        <div className="flex items-center justify-between">
          <Link href="/localities" className="text-xs text-muted hover:text-accent">
            ← Back to all localities
          </Link>
          <ReportIssueButton entityType="Locality" entityName={locality.name} loggedIn={publicSession !== null} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

