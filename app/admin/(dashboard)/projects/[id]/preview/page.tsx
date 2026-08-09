import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectForEdit } from "@/lib/admin-queries";
import { formatPossessionMonthYear, formatPriceBand } from "@/lib/format";
import {
  CATEGORY_LABEL,
  PAYMENT_PLAN_TYPE_LABEL,
  SOURCE_CLASS,
  SOURCE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type DataSource,
  type PaymentPlanType,
  type ProjectStatus,
  type PropertyCategory,
} from "@/lib/project-meta";

export const metadata: Metadata = { title: "Preview — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function ProjectPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectForEdit(id);
  if (!project) notFound();

  const hero = project.images.find((img) => img.kind === "hero") ?? project.images[0];
  const gallery = project.images.filter((img) => img.id !== hero?.id);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Admin preview — not the live public page</p>
          <h1 className="font-mono text-lg font-semibold text-foreground">{project.name}</h1>
        </div>
        <Link
          href={`/admin/projects/${project.id}/edit`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Back to edit
        </Link>
      </div>

      {!project.isPublished ? (
        <div className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
          This project is a draft — it is not visible on the public site yet.
        </div>
      ) : null}

      <div className="relative h-64 w-full overflow-hidden rounded-sm border border-border bg-surface">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.url} alt={project.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No hero image uploaded</div>
        )}
        <span className={`absolute left-3 top-3 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[project.status as ProjectStatus]} bg-background/80 backdrop-blur`}>
          {STATUS_LABEL[project.status as ProjectStatus]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${SOURCE_CLASS[project.dataSource as DataSource]}`}>
          {SOURCE_LABEL[project.dataSource as DataSource]}
        </span>
        {project.isFeatured ? <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-accent">Featured</span> : null}
        {project.isTrending ? <span className="rounded-sm border border-info/40 bg-info/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-info">Trending</span> : null}
        {project.isLuxury ? <span className="rounded-sm border border-purple-400/40 bg-purple-400/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-purple-300">Luxury</span> : null}
        {project.isAffordable ? <span className="rounded-sm border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-positive">Affordable</span> : null}
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted">{CATEGORY_LABEL[project.category as PropertyCategory]}</span>
      </div>

      {project.tagline ? <p className="text-sm text-muted">{project.tagline}</p> : null}

      <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Price band</p>
          <p className="font-mono text-sm text-foreground">{formatPriceBand(project.priceMinPaise !== null ? Number(project.priceMinPaise) : null, project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Locality</p>
          <p className="font-mono text-sm text-foreground">{project.locality?.name ?? "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Builder</p>
          <p className="font-mono text-sm text-foreground">{project.builder?.name ?? project.developerGroup ?? "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Possession</p>
          <p className="font-mono text-sm text-foreground">
            {formatPossessionMonthYear(project.possessionMonth, project.possessionYear, project.status as ProjectStatus, project.promisedPossession)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Payment Plan</p>
          <p className="font-mono text-sm text-foreground">
            {project.paymentPlanType ? PAYMENT_PLAN_TYPE_LABEL[project.paymentPlanType as PaymentPlanType] : "No Payment Plan"}
          </p>
        </div>
      </div>

      {project.description ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description</h2>
          <div className="prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: project.description }} />
        </div>
      ) : null}

      {project.configurations.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Configurations</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Type</th>
                  <th className="py-1.5 pr-3 font-medium">Carpet area</th>
                  <th className="py-1.5 pr-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {project.configurations.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-3 font-mono text-foreground">{c.label}</td>
                    <td className="py-1.5 pr-3 text-muted">{c.carpetSqft ? `${c.carpetSqft} sqft` : "--"}</td>
                    <td className="py-1.5 pr-3 font-mono text-muted">
                      {formatPriceBand(c.priceMinPaise !== null ? Number(c.priceMinPaise) : null, c.priceMaxPaise !== null ? Number(c.priceMaxPaise) : null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {project.amenities.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {project.amenities.map((pa) => (
              <span key={pa.id} className="rounded-sm border border-border px-2 py-1 text-xs text-foreground">
                {pa.amenity.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {gallery.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Gallery</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={img.url} alt={img.alt ?? ""} className="h-24 w-full rounded-sm object-cover" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
