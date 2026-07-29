import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBuilderForEdit } from "@/lib/admin-queries";
import { formatDate } from "@/lib/format";
import { SOURCE_CLASS, SOURCE_LABEL, type DataSource } from "@/lib/project-meta";

export const metadata: Metadata = { title: "Preview — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function BuilderPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const builder = await getBuilderForEdit(id);
  if (!builder) notFound();

  const latestScore = builder.scoreSnapshots[0] ?? null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Admin preview — not the live public page</p>
          <h1 className="font-mono text-lg font-semibold text-foreground">{builder.name}</h1>
        </div>
        <Link
          href={`/admin/builders/${builder.id}/edit`}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Back to edit
        </Link>
      </div>

      {!builder.isPublished ? (
        <div className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
          This builder is a draft — it is not visible on the public site yet.
        </div>
      ) : null}

      <div className="relative h-48 w-full overflow-hidden rounded-sm border border-border bg-surface">
        {builder.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={builder.coverImageUrl} alt={builder.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No cover image uploaded</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {builder.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={builder.logoUrl} alt={builder.name} className="h-12 w-12 rounded-sm border border-border object-cover" />
        ) : null}
        <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${SOURCE_CLASS[builder.dataSource as DataSource]}`}>
          {SOURCE_LABEL[builder.dataSource as DataSource]}
        </span>
        {builder.isFeatured ? <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-accent">Featured</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Headquarters</p>
          <p className="font-mono text-sm text-foreground">{builder.headquarters ?? "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Founded</p>
          <p className="font-mono text-sm text-foreground">{builder.foundedYear ?? "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">RERA</p>
          <p className="font-mono text-sm text-foreground">{builder.reraNumber ?? "--"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Trust score</p>
          <p className="font-mono text-sm text-foreground">{latestScore ? latestScore.overallScore.toString() : "--"}</p>
        </div>
      </div>

      {builder.description ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Description</h2>
          <div className="prose-invert max-w-none text-sm text-foreground" dangerouslySetInnerHTML={{ __html: builder.description }} />
        </div>
      ) : null}

      {builder.awards.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Awards</h2>
          <ul className="flex flex-col gap-1">
            {builder.awards.map((award, i) => (
              <li key={i} className="text-xs text-foreground">
                🏆 {award}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {builder.amenities.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {builder.amenities.map((ba) => (
              <span key={ba.id} className="rounded-sm border border-border px-2 py-1 text-xs text-foreground">
                {ba.amenity.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {builder.timeline.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Timeline</h2>
          <ol className="flex flex-col gap-2 border-l border-border pl-4">
            {builder.timeline.map((event) => (
              <li key={event.id}>
                <p className="font-mono text-xs text-foreground">
                  <span className="text-accent">{event.year}</span> — {event.title}
                </p>
                {event.description ? <p className="text-[11px] text-muted">{event.description}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {builder.images.length > 0 ? (
        <div className="rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Gallery</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {builder.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={img.url} alt={img.alt ?? ""} className="h-24 w-full rounded-sm object-cover" />
            ))}
          </div>
        </div>
      ) : null}

      {latestScore ? (
        <p className="text-[10px] text-muted">Last score update: {formatDate(latestScore.asOf)}</p>
      ) : null}
    </div>
  );
}
