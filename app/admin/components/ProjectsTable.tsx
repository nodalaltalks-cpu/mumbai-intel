"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  bulkProjectAction,
  deleteProjectAction,
  duplicateProjectAction,
  toggleArchiveAction,
  toggleFeaturedAction,
  togglePublishAction,
  type BulkProjectOperation,
} from "@/lib/actions/projects";
import { formatDate, formatPriceBand } from "@/lib/format";
import type { ProjectStatus } from "@/lib/project-meta";
import ConfirmButton from "./ConfirmButton";
import StatusSelect from "./StatusSelect";

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  priceMinPaise: number | null;
  priceMaxPaise: number | null;
  updatedAt: Date;
  isPublished: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  reraNumber?: string | null;
  constructionPercent?: number | null;
  completionPercent?: number | null;
  submittedForReviewAt?: Date | string | null;
  locality: { name: string };
  builder: { name: string } | null;
  images?: { url: string }[];
}

export default function ProjectsTable({ projects, isAdmin }: { projects: ProjectRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === projects.length ? new Set() : new Set(projects.map((p) => p.id))));
  }

  function runBulk(operation: BulkProjectOperation) {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkProjectAction(Array.from(selected), operation);
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateProjectAction(id);
      if (result.newProjectId) router.push(`/admin/projects/${result.newProjectId}/edit`);
      else router.refresh();
    });
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">No projects match these filters</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.size > 0 && isAdmin ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2">
          <span className="text-xs text-foreground">{selected.size} selected</span>
          <button type="button" disabled={isPending} onClick={() => runBulk("publish")} className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-positive hover:text-positive">
            Publish
          </button>
          <button type="button" disabled={isPending} onClick={() => runBulk("unpublish")} className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-accent hover:text-accent">
            Unpublish
          </button>
          <button type="button" disabled={isPending} onClick={() => runBulk("archive")} className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-accent hover:text-accent">
            Archive
          </button>
          <button type="button" disabled={isPending} onClick={() => runBulk("unarchive")} className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-accent hover:text-accent">
            Unarchive
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Move ${selected.size} project(s) to Trash?`)) runBulk("delete");
            }}
            className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
          >
            Move to Trash
          </button>
          {bulkError ? <span className="text-[11px] text-negative">{bulkError}</span> : null}
        </div>
      ) : selected.size > 0 ? (
        <div className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-muted">{selected.size} selected — bulk actions are admin-only</div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
              {isAdmin ? (
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" checked={selected.size === projects.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">Project Name</th>
              <th className="px-3 py-2 font-medium">Locality</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Price band</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Completion</th>
              <th className="px-3 py-2 font-medium">Published</th>
              <th className="px-3 py-2 font-medium">Featured</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                {isAdmin ? (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(project.id)}
                      onChange={() => toggleOne(project.id)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <Link href={`/admin/projects/${project.id}/edit`} className="font-mono text-foreground hover:text-accent">
                    {project.name}
                  </Link>
                  {project.isArchived ? (
                    <span className="ml-1.5 rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase text-muted">Archived</span>
                  ) : null}
                  {!project.isPublished && project.submittedForReviewAt ? (
                    <span className="ml-1.5 rounded-sm border border-accent/40 bg-accent/10 px-1 py-0.5 text-[9px] uppercase text-accent">Under Review</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-muted">{project.locality.name}</td>
                <td className="px-3 py-2">
                  <StatusSelect projectId={project.id} status={project.status as ProjectStatus} />
                </td>
                <td className="px-3 py-2 font-mono text-muted">
                  {formatPriceBand(
                    project.priceMinPaise !== null ? Number(project.priceMinPaise) : null,
                    project.priceMaxPaise !== null ? Number(project.priceMaxPaise) : null
                  )}
                </td>
                <td className="px-3 py-2 text-muted">{formatDate(project.updatedAt)}</td>
                <td className="px-3 py-2 font-mono text-muted">{project.completionPercent ?? 0}%</td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <ToggleButton
                      active={project.isPublished}
                      activeLabel="Published"
                      inactiveLabel="Draft"
                      onToggle={() => togglePublishAction(project.id, !project.isPublished).then(() => router.refresh())}
                    />
                  ) : (
                    <span className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${project.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"}`}>
                      {project.isPublished ? "Published" : "Draft"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <ToggleButton
                    active={project.isFeatured}
                    activeLabel="Featured"
                    inactiveLabel="Standard"
                    onToggle={() => toggleFeaturedAction(project.id, !project.isFeatured).then(() => router.refresh())}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/admin/projects/${project.id}/preview`}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/admin/projects/${project.id}/edit`}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(project.id)}
                      disabled={isPending}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
                    >
                      Duplicate
                    </button>
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleArchiveAction(project.id, !project.isArchived).then(() => router.refresh())}
                          className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                        >
                          {project.isArchived ? "Unarchive" : "Archive"}
                        </button>
                        <ConfirmButton action={deleteProjectAction.bind(null, project.id)} label="Trash" />
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  activeLabel,
  inactiveLabel,
  onToggle,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(onToggle)}
      className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors disabled:opacity-60 ${
        active ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {isPending ? "..." : active ? activeLabel : inactiveLabel}
    </button>
  );
}
