"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  deleteLocalityAction,
  duplicateLocalityAction,
  toggleLocalityArchiveAction,
  toggleLocalityPublishAction,
} from "@/lib/actions/localities";
import type { LocalityRow } from "./LocalitiesTable";
import ConfirmButton from "./ConfirmButton";

export default function LocalityCardsGrid({ localities, isAdmin }: { localities: LocalityRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateLocalityAction(id);
      if (result.newLocalityId) router.push(`/admin/localities/${result.newLocalityId}/edit`);
      else router.refresh();
    });
  }

  if (localities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">No localities match these filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {localities.map((locality) => (
        <div key={locality.id} className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/admin/localities/${locality.id}/edit`} className="truncate font-mono text-sm font-semibold text-foreground hover:text-accent">
                {locality.name}
              </Link>
              <p className="truncate text-[11px] text-muted">{locality.zone?.name ?? "No zone"}</p>
            </div>
            {locality.isArchived ? (
              <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[9px] uppercase text-muted">Archived</span>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted">
            <span>{locality._count.projects} project(s)</span>
            <span>{locality._count.transactions} txn(s)</span>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => toggleLocalityPublishAction(locality.id, !locality.isPublished).then(() => router.refresh())}
                className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${
                  locality.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"
                }`}
              >
                {locality.isPublished ? "Published" : "Draft"}
              </button>
            ) : (
              <span className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${locality.isPublished ? "border-positive/40 bg-positive/10 text-positive" : "border-border text-muted"}`}>
                {locality.isPublished ? "Published" : "Draft"}
              </span>
            )}
            {locality.isFeatured ? (
              <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-accent">Featured</span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-border pt-2">
            <Link
              href={`/admin/localities/${locality.id}/edit`}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => handleDuplicate(locality.id)}
              disabled={isPending}
              className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              Duplicate
            </button>
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleLocalityArchiveAction(locality.id, !locality.isArchived).then(() => router.refresh())}
                  className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                >
                  {locality.isArchived ? "Unarchive" : "Archive"}
                </button>
                <ConfirmButton action={deleteLocalityAction.bind(null, locality.id)} label="Trash" className="px-2 py-1" />
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
