"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";
import { SkeletonBlock } from "@/app/components/ui/Skeleton";
import { clearCompareList, pruneCompareList, removeCompareItem, useCompareList } from "@/lib/compare-list";
import { getProjectsForCompareAction, type CompareProjectGated } from "@/lib/actions/compare";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";

function buildRows(): { label: string; render: (p: CompareProjectGated) => ReactNode }[] {
  return [
    { label: "Locality", render: (p) => p.localityName },
    { label: "Builder", render: (p) => p.builderName ?? "--" },
    { label: "Status", render: (p) => p.status },
    { label: "Category", render: (p) => p.category },
    { label: "Price band", render: (p) => p.priceLabel },
    { label: "Price / sqft", render: (p) => p.pricePerSqftLabel ?? "--" },
    { label: "Configurations", render: (p) => (p.configurationLabels.length ? p.configurationLabels.join(", ") : "--") },
    { label: "Carpet area", render: (p) => p.areaLabel ?? "--" },
    { label: "Total units", render: (p) => p.totalUnits ?? "--" },
    { label: "Construction", render: (p) => (p.constructionPercent !== null ? `${p.constructionPercent}%` : "--") },
    { label: "Possession", render: (p) => p.possessionLabel },
    { label: "RERA number", render: (p) => p.reraNumber ?? "--" },
    { label: "Amenities", render: (p) => p.amenityCount },
    {
      label: "Brochure",
      render: (p) =>
        p.brochureAvailable ? (
          <BrochureDownloadLink
            slug={p.slug}
            brochureUrl={p.brochureUrl}
            brochureFileName={p.brochureFileName}
            className="flex items-center gap-2 text-accent hover:underline"
          >
            {p.brochureThumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.brochureThumbnailUrl} alt="" className="h-8 w-6 rounded-sm border border-border object-cover" />
            ) : null}
            Download
          </BrochureDownloadLink>
        ) : (
          "--"
        ),
    },
  ];
}

const ROWS = buildRows();

/** The client-only body of /compare — split out of the page itself so the page can stay a Server Component and render Navbar/Footer (which read server-only session cookies) without pulling them into a client bundle. Compare's own list/table stays anonymous-friendly by design — only the Brochure row is gated (masked server-side in getProjectsForCompareAction itself, before the response ever reaches this client component). */
export default function CompareView() {
  const slugs = useCompareList();
  const [projects, setProjects] = useState<CompareProjectGated[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getProjectsForCompareAction(slugs);
      setProjects(result);
      // Self-heal stale entries (unpublished/deleted since being added) so
      // the Navbar badge — which reads the same localStorage-backed store —
      // never shows a count higher than what's actually comparable.
      if (result.length !== slugs.length) {
        pruneCompareList(result.map((p) => p.slug));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(",")]);

  return (
    <>
      <div data-mi-debug-slugs={JSON.stringify(slugs)} data-mi-debug-projects={projects === null ? "null" : String(projects.length)} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Compare Projects</h1>
          <p className="text-sm text-muted">Side-by-side comparison of up to 4 projects. Nothing here needs an account.</p>
        </div>
        {slugs.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => clearCompareList()}>
            Clear all
          </Button>
        ) : null}
      </div>

      {slugs.length === 0 ? (
        <EmptyState title="Nothing to compare yet" message="Tap “+ Compare” on any project card or project page to add it here." />
      ) : isPending || projects === null ? (
        <div className="overflow-hidden rounded-sm border border-border">
          <SkeletonBlock className="h-10 w-full rounded-none" />
          <div className="flex flex-col gap-px bg-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-9 w-full rounded-none" />
            ))}
          </div>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState title="These projects are no longer available" message="They may have been unpublished or removed since you added them." />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="w-32 px-3 py-3 text-[10px] font-medium uppercase tracking-wide text-muted">Project</th>
                {projects.map((p) => (
                  <th key={p.slug} className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <Link href={`/projects/${p.slug}`} className="font-mono text-sm text-foreground hover:text-accent">
                        {p.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeCompareItem(p.slug)}
                        className="w-fit rounded-sm border border-border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
                      >
                        Remove
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-b-0 even:bg-surface/50">
                  <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-wide text-muted">{row.label}</td>
                  {projects.map((p) => (
                    <td key={p.slug} className="px-3 py-2.5 text-foreground">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
