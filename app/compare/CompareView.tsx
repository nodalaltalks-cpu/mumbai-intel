"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";
import { clearCompareList, removeCompareItem, useCompareList } from "@/lib/compare-list";
import { getProjectsForCompareAction } from "@/lib/actions/compare";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";
import type { CompareProject } from "@/lib/queries/compare";

const ROWS: { label: string; render: (p: CompareProject) => ReactNode }[] = [
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
      p.brochureUrl ? (
        <BrochureDownloadLink slug={p.slug} brochureUrl={p.brochureUrl} brochureFileName={p.brochureFileName} className="text-accent hover:underline">
          Download
        </BrochureDownloadLink>
      ) : (
        "--"
      ),
  },
];

/** The client-only body of /compare — split out of the page itself so the page can stay a Server Component and render Navbar/Footer (which read server-only session cookies) without pulling them into a client bundle. */
export default function CompareView() {
  const slugs = useCompareList();
  const [projects, setProjects] = useState<CompareProject[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getProjectsForCompareAction(slugs);
      setProjects(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(",")]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Compare Projects</h1>
          <p className="text-sm text-muted">Side-by-side comparison of up to 4 projects — nothing here needs an account.</p>
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
        <p className="text-sm text-muted">Loading comparison…</p>
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
                        className="w-fit rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
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
