"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  deleteProjectAction,
  duplicateProjectAction,
  toggleArchiveAction,
  togglePublishAction,
} from "@/lib/actions/projects";
import { formatPriceBand } from "@/lib/format";
import { STATUS_CLASS, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";
import type { ProjectRow } from "./ProjectsTable";
import ConfirmButton from "./ConfirmButton";

export default function ProjectCardsGrid({ projects, isAdmin }: { projects: ProjectRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <div key={project.id} className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface">
          <div className="relative h-32 w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
            {project.images?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.images[0].url} alt={project.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-mono text-2xl font-bold text-border">
                  {project.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <span
              className={`absolute left-2 top-2 rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${STATUS_CLASS[project.status as ProjectStatus]} bg-background/80 backdrop-blur`}
            >
              {STATUS_LABEL[project.status as ProjectStatus]}
            </span>
            {project.isArchived ? (
              <span className="absolute right-2 top-2 rounded-sm border border-border bg-background/80 px-1.5 py-0.5 text-[9px] uppercase text-muted backdrop-blur">
                Archived
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-2 p-3">
            <div>
              <Link href={`/admin/projects/${project.id}/edit`} className="truncate font-mono text-sm font-semibold text-foreground hover:text-accent">
                {project.name}
              </Link>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {project.locality.name}
                {project.builder ? ` · ${project.builder.name}` : ""}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-mono text-xs text-foreground">
                {formatPriceBand(project.priceMinPaise !== null ? Number(project.priceMinPaise) : null)}
              </span>
              {typeof project.constructionPercent === "number" ? (
                <span className="font-mono text-[11px] text-muted">{project.constructionPercent}%</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => togglePublishAction(project.id, !project.isPublished).then(() => router.refresh())}
                  className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${
                    project.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"
                  }`}
                >
                  {project.isPublished ? "Published" : "Draft"}
                </button>
              ) : (
                <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${project.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"}`}>
                  {project.isPublished ? "Published" : "Draft"}
                </span>
              )}
              {project.reraNumber ? (
                <span className="rounded-sm border border-info/40 bg-info/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-info">RERA</span>
              ) : null}
            </div>

            <div className="mt-auto flex items-center justify-between gap-1 border-t border-border pt-2">
              <Link
                href={`/admin/projects/${project.id}/edit`}
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleDuplicate(project.id)}
                disabled={isPending}
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
              >
                Duplicate
              </button>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => toggleArchiveAction(project.id, !project.isArchived).then(() => router.refresh())}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                  >
                    {project.isArchived ? "Unarchive" : "Archive"}
                  </button>
                  <ConfirmButton action={deleteProjectAction.bind(null, project.id)} label="Trash" className="px-2 py-1" />
                </>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
