import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  computeProjectInvestmentScore,
  getNearbyLocalities,
  getProjectPriceHistory,
  getPublicProjectBySlug,
  getPublicTransactionsPaged,
  getRelatedProjects,
  getTopBuildersForLocality,
  getTransactionConfigurationDistribution,
  getTransactionMonthlyTrend,
  getTransactionStats,
} from "@/lib/queries";
import { formatDate, formatMonth, formatPaise, formatPriceBand, formatPricePerSqft } from "@/lib/format";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";
import { recordBrochureViewed } from "@/lib/analytics/brochure-events";
import {
  AMENITY_CATEGORY_LABEL,
  CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  INFRA_TYPE_LABEL,
  SOURCE_CLASS,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type AmenityCategoryValue,
  type InfraTypeValue,
  type ProjectStatus,
} from "@/lib/project-meta";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import ProjectCard from "@/app/components/ProjectCard";
import BuilderCard from "@/app/components/BuilderCard";
import LocalityCard from "@/app/components/LocalityCard";
import SaveProjectButton from "@/app/components/SaveProjectButton";
import CompareToggleButton from "@/app/components/CompareToggleButton";
import ShareButton from "@/app/components/ShareButton";
import ContactDeveloperButton from "@/app/components/ContactDeveloperButton";
import ReportIssueButton from "@/app/components/ReportIssueButton";
import { isProjectSaved } from "@/lib/actions/saved-projects";
import { getPublicSession } from "@/lib/public-auth/session";
import MapEmbed from "@/app/admin/components/MapEmbed";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import JsonLd from "@/app/components/JsonLd";
import ProjectMarketSnapshot from "@/app/components/ProjectMarketSnapshot";
import TransactionTable from "@/app/components/TransactionTable";
import { ConfigurationDistribution, TransactionLineChart, TransactionVolumeChart } from "@/app/components/charts/TransactionCharts";
import Pagination from "@/app/admin/components/Pagination";
import EmptyState from "@/app/components/ui/EmptyState";
import { Fact, StatCard } from "@/app/components/ui/StatCard";
import Gallery from "./_components/Gallery";
import { recordRecentViewAction } from "@/lib/actions/recent-views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: "Project not found — NoDalalTalks" };
  const title = project.metaTitle || `${project.name} — NoDalalTalks`;
  const description = project.metaDescription || project.tagline || undefined;
  const image = project.images[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: { title, description, type: "website", images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "market", label: "Market Snapshot" },
  { id: "charts", label: "Charts" },
  { id: "configurations", label: "Configurations" },
  { id: "pricing", label: "Pricing" },
  { id: "plans", label: "Floor Plans" },
  { id: "amenities", label: "Amenities" },
  { id: "specifications", label: "Specifications" },
  { id: "builder", label: "Builder" },
  { id: "location", label: "Location" },
  { id: "timeline", label: "Timeline" },
  { id: "transactions", label: "Transactions" },
  { id: "investment-notes", label: "Investment Snapshot" },
  { id: "related", label: "Related" },
  { id: "downloads", label: "Downloads" },
  { id: "faqs", label: "FAQs" },
];

interface ProjectSearchParams {
  page?: string;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ProjectSearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  await recordRecentViewAction("Project", project.id);
  if (project.brochureUrl) {
    await recordBrochureViewed({ id: project.id, builderId: project.builderId, localityId: project.localityId, microMarketId: project.microMarketId });
  }

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const txFilters = { projectId: project.id };

  const [
    related,
    priceHistory,
    txStats,
    monthlyTrend,
    configDistribution,
    { items: transactions, total: totalTransactions, totalPages },
    { items: latestTx },
    nearbyBuilders,
    nearbyLocalities,
    isSaved,
    publicSession,
  ] = await Promise.all([
    getRelatedProjects({ id: project.id, localityId: project.localityId, builderId: project.builderId }),
    getProjectPriceHistory(project.id),
    getTransactionStats(txFilters),
    getTransactionMonthlyTrend(txFilters, 12),
    getTransactionConfigurationDistribution(txFilters),
    getPublicTransactionsPaged({ ...txFilters, page, pageSize: 10 }),
    getPublicTransactionsPaged({ ...txFilters, page: 1, pageSize: 1, sortBy: "date_desc" }),
    getTopBuildersForLocality(project.localityId, 4),
    getNearbyLocalities(project.localityId, 4),
    isProjectSaved(project.id),
    getPublicSession(),
  ]);

  const investmentScore = computeProjectInvestmentScore(project.localityInvestmentScore, project.builderOverallScore, txStats.totalTransactions);
  const latestRegistration = latestTx[0]?.registrationDate ?? null;
  const latestTransactionPricePaise = latestTx[0]?.valuePaise ?? null;
  const latestTransactionPricePerSqftPaise = latestTx[0]?.pricePerSqftPaise ?? null;
  const otherNearbyBuilders = nearbyBuilders.filter((b) => b.slug !== project.builder?.slug);
  const summaryNotes = project.investmentNotes.filter((n) => n.kind === "summary");
  const proNotes = project.investmentNotes.filter((n) => n.kind === "pro");
  const conNotes = project.investmentNotes.filter((n) => n.kind === "con");

  function buildTxHref(targetPage: number) {
    return targetPage > 1 ? `/projects/${slug}?page=${targetPage}#transactions` : `/projects/${slug}#transactions`;
  }

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: project.name,
    description: project.tagline || project.metaDescription || undefined,
    image: project.images[0]?.url ? [project.images[0].url] : undefined,
    brand: project.builder ? { "@type": "Organization", name: project.builder.name } : undefined,
    ...(project.priceMinPaise !== null
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: (Number(project.priceMinPaise) / 100).toFixed(0),
            availability: "https://schema.org/InStock",
            url: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/projects/${project.slug}`,
          },
        }
      : {}),
  };

  const heroImage = project.images.find((i) => i.kind === "hero") ?? project.images[0] ?? null;
  const galleryImages = project.images.filter((i) => i.id !== heroImage?.id);
  const floorPlanImages = project.images.filter((i) => i.kind === "floorplan");
  const masterPlanImages = project.images.filter((i) => i.kind === "masterplan");
  const amenitiesByCategory = project.amenities.reduce<Record<string, { name: string }[]>>((acc, pa) => {
    (acc[pa.amenity.category] ??= []).push({ name: pa.amenity.name });
    return acc;
  }, {});
  const specsByCategory = project.specifications.reduce<Record<string, string[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s.detail);
    return acc;
  }, {});
  const nearbyByType = project.infraLinks.reduce<Record<string, typeof project.infraLinks>>((acc, link) => {
    (acc[link.infra.type] ??= []).push(link);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <JsonLd data={productSchema} />
      <Navbar />

      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: project.locality.name, href: `/localities/${project.locality.slug}` },
          { label: project.name },
        ]}
      />

      {/* ── Hero ── */}
      <div className="relative h-[42vh] min-h-[320px] w-full overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
        {heroImage ? (
          <Image src={heroImage.url} alt={project.name} fill priority sizes="100vw" className="object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[project.status as ProjectStatus]}`}>
              {STATUS_LABEL[project.status as ProjectStatus]}
            </span>
            <span className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${SOURCE_CLASS[project.dataSource]}`}>
              {SOURCE_LABEL[project.dataSource]}
            </span>
            {project.isFeatured ? (
              <span className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">Featured</span>
            ) : null}
            <SaveProjectButton projectId={project.id} initialSaved={isSaved} />
            <CompareToggleButton slug={project.slug} />
            <ShareButton title={project.name} text={`Check out ${project.name} on NoDalalTalks`} />
            <ContactDeveloperButton
              projectName={project.name}
              defaultName={publicSession?.name}
              defaultEmail={publicSession?.email}
            />
            {project.brochureUrl ? (
              <BrochureDownloadLink
                slug={project.slug}
                brochureUrl={project.brochureUrl}
                brochureFileName={project.brochureFileName}
                className="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
              >
                📄 Download Brochure
              </BrochureDownloadLink>
            ) : null}
          </div>
          <h1 className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.locality.name}
            {project.microMarket ? ` · ${project.microMarket.name}` : ""}
            {project.locality.zone ? ` · ${project.locality.zone.name}` : ""}
          </p>
          {project.tagline ? <p className="mt-1 text-sm text-foreground">{project.tagline}</p> : null}
          <div className="mt-3 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Price band</p>
              <p className="font-mono text-xl text-accent">{formatPriceBand(project.priceMinPaise, project.priceMaxPaise)}</p>
            </div>
            {project.constructionPercent !== null ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Construction</p>
                <p className="font-mono text-xl text-foreground">{project.constructionPercent}%</p>
              </div>
            ) : null}
            {project.launchDate ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Launch year</p>
                <p className="font-mono text-xl text-foreground">{new Date(project.launchDate).getFullYear()}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Possession</p>
              <p className="font-mono text-sm text-foreground">{formatDate(project.promisedPossession)}</p>
            </div>
            {project.builder ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Builder</p>
                <p className="font-mono text-sm text-foreground">{project.builder.name}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Sticky in-page nav ── */}
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
        {/* Gallery */}
        {galleryImages.length > 0 ? <Gallery images={galleryImages} /> : null}

        {/* Overview */}
        <section id="overview" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Overview</h2>
          {project.highlights.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {project.highlights.map((h, i) => (
                <li key={i} className="rounded-sm border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs text-accent">
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
          {project.description ? (
            <div
              className="prose-invert mt-4 text-sm text-foreground [&_a]:text-accent [&_li]:my-0.5 [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          ) : (
            <p className="mt-3 text-sm text-muted">No description added yet.</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
            <Fact label="Category" value={CATEGORY_LABEL[project.category]} />
            <Fact label="Total units" value={project.totalUnits ?? "--"} />
            <Fact label="Total towers" value={project.totalTowers ?? "--"} />
            <Fact label="Land area" value={project.landAreaAcres !== null ? `${project.landAreaAcres} acres` : "--"} />
            <Fact label="Launch date" value={formatDate(project.launchDate)} />
            <Fact label="Possession" value={formatDate(project.promisedPossession)} />
            <Fact label="RERA" value={project.reraNumber ?? "--"} />
            <Fact label="RERA status" value={project.reraStatus ?? "--"} />
          </div>

          {project.sections.map((section) => (
            <div key={section.id} className="mt-4">
              <h3 className="font-mono text-sm font-semibold text-foreground">{section.title}</h3>
              <div
                className="prose-invert mt-1.5 text-sm text-muted [&_a]:text-accent [&_p]:my-1.5"
                dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
              />
            </div>
          ))}
        </section>

        {/* Market Snapshot */}
        <section id="market" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Market Snapshot</h2>
          <div className="mt-3">
            <ProjectMarketSnapshot
              stats={txStats}
              startingPricePaise={project.priceMinPaise !== null ? Number(project.priceMinPaise) : null}
              pricePerSqftPaise={project.configPricePerSqftPaise}
              rentalYieldPercent={project.localityRentalYieldPercent}
              investmentScore={investmentScore}
            />
          </div>
        </section>

        {/* Charts */}
        <section id="charts" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Charts</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Price Trend</p>
              <div className="mt-3">
                <TransactionLineChart
                  points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.avgPricePerSqftPaise }))}
                  ariaLabel="Average price per square foot trend"
                />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Transaction Trend</p>
              <div className="mt-3">
                <TransactionVolumeChart points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), count: p.count }))} />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Sales Volume</p>
              <div className="mt-3">
                <TransactionLineChart
                  points={monthlyTrend.map((p) => ({ month: p.month.toISOString(), value: p.totalValuePaise }))}
                  ariaLabel="Monthly sales volume"
                />
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">Configuration Distribution</p>
              <div className="mt-3">
                <ConfigurationDistribution buckets={configDistribution} />
              </div>
            </div>
          </div>
        </section>

        {/* Configurations */}
        <section id="configurations" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Configurations</h2>
          {project.configurations.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Configuration</th>
                    <th className="px-3 py-2 font-medium">Carpet area</th>
                    <th className="px-3 py-2 font-medium">Built-up area</th>
                    <th className="px-3 py-2 font-medium text-right">Price band</th>
                  </tr>
                </thead>
                <tbody>
                  {project.configurations.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-foreground">{c.label}</td>
                      <td className="px-3 py-2 text-muted">{c.carpetSqft ? `${c.carpetSqft} sqft` : "--"}</td>
                      <td className="px-3 py-2 text-muted">{c.builtUpSqft ? `${c.builtUpSqft} sqft` : "--"}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{formatPriceBand(c.priceMinPaise, c.priceMaxPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No unit configurations added yet.</p>
          )}
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Pricing</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-3">
            <Fact label="Price band" value={formatPriceBand(project.priceMinPaise, project.priceMaxPaise)} accent />
            <Fact label="Min price" value={formatPaise(project.priceMinPaise)} />
            <Fact label="Max price" value={formatPaise(project.priceMaxPaise)} />
          </div>
        </section>

        {/* Floor Plans + Master Plan */}
        <section id="plans" className="scroll-mt-32 flex flex-col gap-6">
          <div>
            <h2 className="font-mono text-lg font-semibold text-foreground">Floor Plans</h2>
            {floorPlanImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {floorPlanImages.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={img.id} src={img.url} alt={img.alt ?? "Floor plan"} className="rounded-sm border border-border object-cover" />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No floor plans uploaded yet.</p>
            )}
          </div>
          <div>
            <h2 className="font-mono text-lg font-semibold text-foreground">Master Plan</h2>
            {masterPlanImages.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {masterPlanImages.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={img.id} src={img.url} alt={img.alt ?? "Master plan"} className="rounded-sm border border-border object-cover" />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No master plan uploaded yet.</p>
            )}
          </div>
        </section>

        {/* Amenities */}
        <section id="amenities" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Amenities</h2>
          {Object.keys(amenitiesByCategory).length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(amenitiesByCategory).map(([category, items]) => (
                <div key={category} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{AMENITY_CATEGORY_LABEL[category as AmenityCategoryValue]}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-foreground">
                        {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No amenities added yet.</p>
          )}
        </section>

        {/* Specifications */}
        <section id="specifications" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Specifications</h2>
          {Object.keys(specsByCategory).length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(specsByCategory).map(([category, details]) => (
                <div key={category} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{category}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {details.map((detail, i) => (
                      <li key={i} className="text-xs text-foreground">
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No specifications added yet.</p>
          )}
        </section>

        {/* Builder */}
        <section id="builder" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Builder</h2>
          {project.builder ? (
            <Link
              href={`/builders/${project.builder.slug}`}
              className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-raised"
            >
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{project.builder.name}</p>
                {project.builder.headquarters ? <p className="mt-0.5 text-xs text-muted">{project.builder.headquarters}</p> : null}
                {project.builder.description ? <p className="mt-2 max-w-xl text-xs text-muted">{project.builder.description}</p> : null}
              </div>
              {project.builder.overallScore !== null ? (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Trust score</p>
                  <p className="font-mono text-2xl text-accent">{project.builder.overallScore.toFixed(1)}</p>
                </div>
              ) : null}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-muted">Builder not specified.</p>
          )}

          <h2 className="mt-6 font-mono text-lg font-semibold text-foreground">Locality</h2>
          <Link
            href={`/localities/${project.locality.slug}`}
            className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-raised"
          >
            <div>
              <p className="font-mono text-sm font-semibold text-foreground">{project.locality.name}</p>
              <p className="mt-0.5 text-xs text-muted">{project.locality.zone?.name ?? project.locality.city.name} · Area Intelligence →</p>
            </div>
            {project.localityInvestmentScore !== null ? (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted">Investment score</p>
                <p className="font-mono text-2xl text-accent">{project.localityInvestmentScore.toFixed(1)}</p>
              </div>
            ) : null}
          </Link>
        </section>

        {/* Location + Nearby */}
        <section id="location" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Location</h2>
          <p className="mt-1 text-sm text-muted">{project.address ?? `${project.locality.name}, ${project.locality.city.name}`}</p>
          <div className="mt-3">
            <MapEmbed latitude={project.latitude} longitude={project.longitude} />
          </div>

          <h3 className="mt-6 font-mono text-sm font-semibold text-foreground">Nearby places</h3>
          {Object.keys(nearbyByType).length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(nearbyByType).map(([type, links]) => (
                <div key={type} className="rounded-sm border border-border bg-surface p-3">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{INFRA_TYPE_LABEL[type as InfraTypeValue]}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {links.map((link) => (
                      <li key={link.id} className="flex items-center justify-between text-xs text-foreground">
                        <span>{link.infra.name}</span>
                        <span className="font-mono text-muted">
                          {link.distanceMeters < 1000 ? `${link.distanceMeters}m` : `${(link.distanceMeters / 1000).toFixed(1)}km`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No nearby places catalogued yet.</p>
          )}
        </section>

        {/* Timeline */}
        <section id="timeline" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Construction Timeline</h2>
          {project.timelineEvents.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-2 border-l border-border pl-4">
              {project.timelineEvents.map((event) => (
                <li key={event.id}>
                  <p className="font-mono text-xs text-foreground">
                    {event.eventDate ? <span className="text-accent">{formatDate(event.eventDate)}</span> : null} {event.title}
                  </p>
                  {event.description ? <p className="text-xs text-muted">{event.description}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">No timeline published yet.</p>
          )}
        </section>

        {/* Curated Price History */}
        <div className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Curated Price History</h2>
          <p className="mt-1 text-xs text-muted">Analyst-verified monthly average, independent of registered transactions</p>
          {priceHistory.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[400px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium text-right">Avg ₹/sqft</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((point, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-mono text-foreground">{formatMonth(point.month)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{formatPricePerSqft(point.avgPricePerSqftPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No price history recorded yet.</p>
          )}
        </div>

        {/* Transaction Intelligence */}
        <section id="transactions" className="scroll-mt-32">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-lg font-semibold text-foreground">Transaction Intelligence</h2>
            {totalTransactions > 0 ? (
              <Link href={`/transactions?project=${project.id}`} className="text-xs text-muted hover:text-accent">
                Open in Transactions →
              </Link>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Latest transaction price" value={formatPaise(latestTransactionPricePaise)} accent size="md" />
            <StatCard label="Latest price / sqft" value={formatPricePerSqft(latestTransactionPricePerSqftPaise)} accent size="md" />
            <StatCard label="Latest registration" value={latestRegistration ? formatDate(latestRegistration) : "--"} size="md" />
            <StatCard label="Highest sale" value={formatPaise(txStats.highestPricePaise)} size="md" />
            <StatCard label="Lowest sale" value={formatPaise(txStats.lowestPricePaise)} size="md" />
            <StatCard label="Total transactions" value={String(totalTransactions)} size="md" />
          </div>

          <h3 className="mt-6 font-mono text-sm font-semibold text-foreground">Transaction History</h3>
          {transactions.length > 0 ? (
            <div className="mt-3 flex flex-col gap-4">
              <TransactionTable transactions={transactions} />
              <Pagination page={page} totalPages={totalPages} total={totalTransactions} buildHref={buildTxHref} />
            </div>
          ) : (
            <EmptyState className="mt-3" title="No transactions recorded yet" message="Registered transactions for this project will appear here." />
          )}
        </section>

        {/* Investment Notes — summary + pros/cons, each tagged with its data source and confidence */}
        <section id="investment-notes" className="scroll-mt-32">
          {project.investmentNotes.length > 0 ? (
            <>
              <h2 className="font-mono text-lg font-semibold text-foreground">Investment Snapshot</h2>
              {summaryNotes.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3">
                  {summaryNotes.map((note) => (
                    <div key={note.id}>
                      <p className="text-sm leading-relaxed text-foreground">{note.body}</p>
                      <span
                        className={`mt-1.5 inline-flex rounded-sm border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${SOURCE_CLASS[note.dataSource]}`}
                      >
                        {SOURCE_LABEL[note.dataSource]} &middot; {CONFIDENCE_LABEL[note.confidence]} confidence
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {proNotes.length > 0 || conNotes.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {proNotes.length > 0 ? (
                    <div>
                      <h3 className="font-mono text-xs uppercase tracking-wide text-positive">Pros</h3>
                      <ul className="mt-2 flex flex-col gap-2">
                        {proNotes.map((note) => (
                          <li key={note.id} className="rounded-sm border border-positive/20 bg-positive/5 p-3 text-xs text-foreground">
                            {note.body}
                            <span
                              className={`mt-1.5 block w-fit rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${SOURCE_CLASS[note.dataSource]}`}
                            >
                              {SOURCE_LABEL[note.dataSource]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {conNotes.length > 0 ? (
                    <div>
                      <h3 className="font-mono text-xs uppercase tracking-wide text-negative">Cons</h3>
                      <ul className="mt-2 flex flex-col gap-2">
                        {conNotes.map((note) => (
                          <li key={note.id} className="rounded-sm border border-negative/20 bg-negative/5 p-3 text-xs text-foreground">
                            {note.body}
                            <span
                              className={`mt-1.5 block w-fit rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${SOURCE_CLASS[note.dataSource]}`}
                            >
                              {SOURCE_LABEL[note.dataSource]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-sm border border-dashed border-info/40 bg-info/5 p-4">
              <p className="font-mono text-[11px] uppercase tracking-wide text-info">Investment Snapshot — Coming Soon</p>
              <p className="mt-1 text-xs text-muted">
                An investment summary for this project will appear here once one has been reviewed and published.
              </p>
            </div>
          )}
        </section>

        {/* Related */}
        <section id="related" className="scroll-mt-32 flex flex-col gap-8">
          {related.length > 0 ? (
            <div>
              <h2 className="font-mono text-lg font-semibold text-foreground">Nearby Projects</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="font-mono text-lg font-semibold text-foreground">Nearby Builders</h2>
            {otherNearbyBuilders.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {otherNearbyBuilders.map((b) => (
                  <BuilderCard
                    key={b.slug}
                    builder={{ slug: b.slug, name: b.name, logoUrl: b.logoUrl, overallScore: b.score, projectCount: b.projectCount }}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No other builders active in this locality yet.</p>
            )}
          </div>

          <div>
            <h2 className="font-mono text-lg font-semibold text-foreground">Nearby Localities</h2>
            {nearbyLocalities.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {nearbyLocalities.map((l) => (
                  <LocalityCard key={l.id} locality={l} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No nearby localities published yet.</p>
            )}
          </div>
        </section>

        {/* Downloads */}
        <section id="downloads" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Downloads</h2>
          {project.brochureUrl || project.documents.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {project.brochureUrl ? (
                <li>
                  <BrochureDownloadLink
                    slug={project.slug}
                    brochureUrl={project.brochureUrl}
                    brochureFileName={project.brochureFileName}
                    className="text-sm text-accent hover:underline"
                  >
                    Download Brochure
                  </BrochureDownloadLink>
                </li>
              ) : null}
              {project.documents.map((doc) => (
                <li key={doc.id}>
                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
                    {doc.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No downloads available yet.</p>
          )}
        </section>

        {/* FAQs */}
        <section id="faqs" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">FAQs</h2>
          {project.faqs.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {project.faqs.map((faq) => (
                <details key={faq.id} className="rounded-sm border border-border bg-surface p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">{faq.question}</summary>
                  <p className="mt-2 text-xs text-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No FAQs added yet.</p>
          )}
        </section>

        <div className="flex items-center justify-between">
          <Link href="/projects" className="text-xs text-muted hover:text-accent">
            ← Back to all projects
          </Link>
          <ReportIssueButton entityType="Project" entityName={project.name} loggedIn={publicSession !== null} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

