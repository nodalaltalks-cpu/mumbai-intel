"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  deleteBuilderAction,
  duplicateBuilderAction,
  toggleBuilderArchiveAction,
  toggleBuilderPublishAction,
} from "@/lib/actions/builders";
import type { BuilderRow } from "./BuildersTable";
import ConfirmButton from "./ConfirmButton";

export default function BuilderCardsGrid({ builders }: { builders: BuilderRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateBuilderAction(id);
      if (result.newBuilderId) router.push(`/admin/builders/${result.newBuilderId}/edit`);
      else router.refresh();
    });
  }

  if (builders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">No builders match these filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {builders.map((builder) => (
        <div key={builder.id} className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            {builder.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={builder.logoUrl} alt={builder.name} className="h-10 w-10 rounded-sm border border-border object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-background">
                <span className="font-mono text-xs font-bold text-muted">{builder.name.slice(0, 2).toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <Link href={`/admin/builders/${builder.id}/edit`} className="truncate font-mono text-sm font-semibold text-foreground hover:text-accent">
                {builder.name}
              </Link>
              <p className="truncate text-[11px] text-muted">{builder.headquarters ?? "--"}</p>
            </div>
            {builder.isArchived ? (
              <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[9px] uppercase text-muted">Archived</span>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="font-mono text-[11px] text-muted">{builder._count.projects} project(s)</span>
            <button
              type="button"
              onClick={() => toggleBuilderPublishAction(builder.id, !builder.isPublished).then(() => router.refresh())}
              className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${
                builder.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"
              }`}
            >
              {builder.isPublished ? "Published" : "Draft"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
            <Link
              href={`/admin/builders/${builder.id}/edit`}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => handleDuplicate(builder.id)}
              disabled={isPending}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => toggleBuilderArchiveAction(builder.id, !builder.isArchived).then(() => router.refresh())}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              {builder.isArchived ? "Unarchive" : "Archive"}
            </button>
            <ConfirmButton action={deleteBuilderAction.bind(null, builder.id)} className="px-2 py-1" />
          </div>
        </div>
      ))}
    </div>
  );
}
