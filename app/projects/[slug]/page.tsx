import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNearbyLocalities, getPublicProjectBySlug, getRelatedProjects, getTopBuildersForLocality } from "@/lib/queries";
import { formatBytes, formatDate, formatPaise, formatPossessionMonthYear, formatPriceBand } from "@/lib/format";
import InfoTooltip from "@/app/components/ui/InfoTooltip";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";
import { maskProjectBrochure } from "@/lib/premium/mask";
import { recordBrochureViewed } from "@/lib/analytics/brochure-events";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import {
  AMENITY_CATEGORY_LABEL,
  CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  INFRA_TYPE_LABEL,
  optimizedImageUrl,
  PAYMENT_PLAN_TYPE_LABEL,
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
import WhatsAppShareButton from "@/app/components/WhatsAppShareButton";
import ReportIssueButton from "@/app/components/ReportIssueButton";
import { isProjectSaved } from "@/lib/actions/saved-projects";
import { getPublicSession } from "@/lib/public-auth/session";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import JsonLd from "@/app/components/JsonLd";
import GAPageEvent from "@/app/components/analytics/GAPageEvent";
import { Fact } from "@/app/components/ui/StatCard";
import Gallery from "./_components/Gallery";
import { recordRecentViewAction } from "@/lib/actions/recent-views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: "Project not found - NoDalalTalks" };
  const title = project.metaTitle || `${project.name} - NoDalalTalks`;
  const description = project.metaDescription || project.tagline || undefined;
  const image = (project.images.find((i) => i.kind === "hero") ?? project.images[0])?.url;
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
  { id: "configurations", label: "Configurations" },
  { id: "pricing", label: "Pricing" },
  { id: "plans", label: "Floor Plans" },
  { id: "amenities", label: "Amenities" },
  { id: "specifications", label: "Specifications" },
  { id: "builder", label: "Builder" },
  { id: "location", label: "Location" },
  { id: "timeline", label: "Timeline" },
  { id: "investment-notes", label: "Investment Snapshot" },
  { id: "related", label: "Related" },
  { id: "downloads", label: "Downloads" },
  { id: "faqs", label: "FAQs" },
];

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  await recordRecentViewAction("Project", project.id);
  await recordResearchEvent("PROJECT_VIEWED", { entityType: "Project", entityId: project.id });
  if (project.brochureUrl) {
    await recordBrochureViewed({ id: project.id, builderId: project.builderId, localityId: project.localityId, microMarketId: project.microMarketId });
  }

  const [related, nearbyBuilders, nearbyLocalities, isSaved, publicSession] = await Promise.all([
    getRelatedProjects({ id: project.id, localityId: project.localityId, builderId: project.builderId }),
    getTopBuildersForLocality(project.localityId, 4),
    getNearbyLocalities(project.localityId, 4),
    isProjectSaved(project.id),
    getPublicSession(),
  ]);

  const locked = publicSession === null;
  // Floor Plan is a ProjectDocument row (kind "floor_plan" PDF or "floor_plan_image")
  // — filtered out of the generic Downloads list into its own View/Download block
  // below, same reasoning as the admin edit page's own floorPlanDoc split.
  const FLOOR_PLAN_KINDS = ["floor_plan", "floor_plan_image"];
  const floorPlanDoc = project.documents.find((d) => FLOOR_PLAN_KINDS.includes(d.kind)) ?? null;
  const otherDocuments = project.documents.filter((d) => !FLOOR_PLAN_KINDS.includes(d.kind));
  const otherNearbyBuilders = nearbyBuilders.filter((b) => b.slug !== project.builder?.slug);
  const summaryNotes = project.investmentNotes.filter((n) => n.kind === "summary");
  const proNotes = project.investmentNotes.filter((n) => n.kind === "pro");
  const conNotes = project.investmentNotes.filter((n) => n.kind === "con");

  const heroImage = project.images.find((i) => i.kind === "hero") ?? project.images[0] ?? null;

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: project.name,
    description: project.tagline || project.metaDescription || undefined,
    image: heroImage ? [heroImage.url] : undefined,
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
    <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden bg-background">
      <JsonLd data={productSchema} />
      <GAPageEvent event="project_viewed" params={{ project_id: project.id, project_name: project.name }} />
      <Navbar />

      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: project.locality.name, href: `/localities/${project.locality.slug}` },
          { label: project.name },
        ]}
      />

      {/* ── Hero image band — a fixed-aspect visual only; all text/actions live below it in
          normal document flow so nothing can ever get clipped on a short mobile viewport
          (the old overlay-on-fixed-height pattern could crop the badge/action row on small
          phones once the title + tagline pushed the block taller than the image). ── */}
      <div className="relative h-[28vh] max-h-[320px] min-h-[160px] w-full overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
        {heroImage ? (
          <Image src={optimizedImageUrl(heroImage.url)} alt={project.name} fill priority sizes="100vw" className="object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
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
        </div>

        <h1 className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">{project.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {project.locality.name}
          {project.microMarket ? ` · ${project.microMarket.name}` : ""}
          {project.locality.zone ? ` · ${project.locality.zone.name}` : ""}
        </p>
        {project.tagline ? <p className="mt-1 text-sm text-foreground">{project.tagline}</p> : null}

        {/* Key facts — a real grid (not flex-wrap) so mobile stacking is predictable, all
            five given equal visual weight per the "don't make these weak" requirement. */}
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-sm border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Price</p>
            <p className="font-mono text-lg font-semibold text-accent sm:text-xl">{formatPriceBand(project.priceMinPaise, project.priceMaxPaise)}</p>
          </div>
          {project.constructionPercent !== null ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Construction</p>
              <p className="font-mono text-lg font-semibold text-foreground sm:text-xl">{project.constructionPercent}%</p>
            </div>
          ) : null}
          {project.launchDate ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Launch year</p>
              <p className="font-mono text-lg font-semibold text-foreground sm:text-xl">{new Date(project.launchDate).getFullYear()}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Possession</p>
            <p className="font-mono text-lg font-semibold text-foreground sm:text-xl">
              {formatPossessionMonthYear(project.possessionMonth, project.possessionYear, project.status, project.promisedPossession)}
            </p>
          </div>
          {project.builder ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Builder</p>
              <p className="font-mono text-lg font-semibold text-foreground sm:text-xl">{project.builder.name}</p>
            </div>
          ) : null}
        </div>

        {/* Actions — full-width, comfortably tappable row on mobile; wraps naturally on desktop. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SaveProjectButton projectId={project.id} initialSaved={isSaved} />
          <CompareToggleButton slug={project.slug} />
          <ShareButton title={project.name} text={`Check out ${project.name} on NoDalalTalks`} />
          <WhatsAppShareButton projectId={project.id} projectName={project.name} projectSlug={project.slug} />
          {project.brochureUrl ? (
            <BrochureDownloadLink
              slug={project.slug}
              brochureUrl={locked ? null : project.brochureUrl}
              brochureFileName={locked ? null : project.brochureFileName}
              className="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
            >
              📄 Download Brochure
            </BrochureDownloadLink>
          ) : null}
        </div>
      </div>

      {/* ── Sticky in-page nav — the only element allowed to scroll horizontally on its own;
          the page itself never does (root wrapper below has overflow-x-hidden). ── */}
      <nav className="sticky top-[57px] z-40 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex w-max min-w-full gap-4 py-2.5 sm:mx-auto sm:max-w-6xl">
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
            <Fact
              label="Possession"
              value={formatPossessionMonthYear(project.possessionMonth, project.possessionYear, project.status, project.promisedPossession)}
            />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">RERA</p>
              <p className="font-mono text-sm text-foreground">{project.reraNumber ?? "--"}</p>
              {project.reraCertificateUrl ? (
                <a
                  href={project.reraCertificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] font-semibold text-accent hover:underline"
                >
                  View RERA Certificate →
                </a>
              ) : null}
            </div>
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
            <div>
              <div className="flex items-center gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted">Payment Plan</p>
                {project.paymentPlanDescription ? (
                  <InfoTooltip
                    label={`${project.paymentPlanType ? PAYMENT_PLAN_TYPE_LABEL[project.paymentPlanType] : "Payment plan"}: payment plan details`}
                  >
                    {project.paymentPlanDescription}
                  </InfoTooltip>
                ) : null}
              </div>
              <p className="font-mono text-sm text-foreground">
                {project.paymentPlanType ? PAYMENT_PLAN_TYPE_LABEL[project.paymentPlanType] : "No Payment Plan"}
              </p>
            </div>
          </div>
          {/* Transaction data is a different domain (actual registered transactions, not this
              project's asking price) and lives entirely on its own page — this is a pointer,
              not a duplicate of that data here. */}
          <p className="mt-3 text-xs text-muted">
            <Link href={`/reports/projects/${project.slug}`} className="font-semibold text-accent hover:underline">
              View Transaction Intelligence →
            </Link>{" "}
            for actual registered transaction data and market trends.
          </p>
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
                  <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{AMENITY_CATEGORY_LABEL[category as AmenityCategoryValue] ?? category}</p>
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

        {/* Location + Nearby — no map/coordinates here: this account never asks for or shows
            latitude/longitude on the public page, only the address and the Google Maps link
            the admin actually pastes in. */}
        <section id="location" className="scroll-mt-32">
          <h2 className="font-mono text-lg font-semibold text-foreground">Location</h2>
          <div className="mt-3 rounded-sm border border-border bg-surface p-4">
            <p className="text-sm text-foreground">{project.address ?? `${project.locality.name}, ${project.locality.city.name}`}</p>
            {project.famousLandmark ? <p className="mt-1.5 text-xs text-accent">{project.famousLandmark}</p> : null}
            {project.googleMapsUrl ? (
              <a
                href={project.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
              >
                View on Google Maps →
              </a>
            ) : null}
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
              <p className="font-mono text-[11px] uppercase tracking-wide text-info">Investment Snapshot: Coming Soon</p>
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
                  <ProjectCard key={p.id} project={maskProjectBrochure(p, locked)} />
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
                    locked={locked}
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
                  <LocalityCard key={l.id} locality={l} locked={locked} />
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
          {project.brochureUrl || floorPlanDoc || otherDocuments.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              {project.brochureUrl ? (
                <BrochureDownloadLink
                  slug={project.slug}
                  brochureUrl={locked ? null : project.brochureUrl}
                  brochureFileName={locked ? null : project.brochureFileName}
                  className="flex items-center gap-4 rounded-sm border border-accent/30 bg-accent/5 p-4 transition-colors hover:bg-accent/10"
                >
                  {project.brochureThumbnailUrl ? (
                    <Image
                      src={project.brochureThumbnailUrl}
                      alt={`${project.name} brochure thumbnail`}
                      width={72}
                      height={96}
                      className="h-24 w-[72px] shrink-0 rounded-sm border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-2xl">
                      📄
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] uppercase tracking-wide text-accent">Official Project Brochure</span>
                    <span className="mt-0.5 block text-sm font-semibold text-foreground">Download Latest Brochure</span>
                    <span className="mt-1 block text-xs text-muted">
                      {project.brochureUploadedAt ? `Updated ${formatDate(project.brochureUploadedAt)}` : null}
                      {project.brochureFileSize ? ` · ${formatBytes(project.brochureFileSize)}` : null} · PDF
                    </span>
                  </span>
                </BrochureDownloadLink>
              ) : null}
              {floorPlanDoc ? (
                <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface p-4">
                  <div className="min-w-0">
                    <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">Floor Plan</span>
                    <span className="mt-0.5 block text-sm font-semibold text-foreground">
                      {floorPlanDoc.kind === "floor_plan_image" ? "Image" : "PDF"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={
                        floorPlanDoc.kind === "floor_plan_image"
                          ? floorPlanDoc.url
                          : `/api/brochure-download?url=${encodeURIComponent(floorPlanDoc.url)}&filename=${encodeURIComponent(`${project.name} Floor Plan.pdf`)}&inline=1`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      View
                    </a>
                    <a
                      href={
                        floorPlanDoc.kind === "floor_plan_image"
                          ? floorPlanDoc.url
                          : `/api/brochure-download?url=${encodeURIComponent(floorPlanDoc.url)}&filename=${encodeURIComponent(`${project.name} Floor Plan.pdf`)}`
                      }
                      download={floorPlanDoc.kind === "floor_plan_image" ? "" : undefined}
                      className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ) : null}
              <ul className="flex flex-col gap-1.5">
              {otherDocuments.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={`/api/brochure-download?url=${encodeURIComponent(doc.url)}&filename=${encodeURIComponent(doc.title || "document.pdf")}&inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    {doc.title}
                  </a>
                </li>
              ))}
              </ul>
            </div>
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
          <ReportIssueButton entityType="Project" entityId={project.id} entityName={project.name} loggedIn={publicSession !== null} />
        </div>
      </main>

      <Footer />
    </div>
  );
}

