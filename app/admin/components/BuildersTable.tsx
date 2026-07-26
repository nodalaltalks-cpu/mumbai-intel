"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  bulkBuilderAction,
  deleteBuilderAction,
  duplicateBuilderAction,
  toggleBuilderArchiveAction,
  toggleBuilderFeaturedAction,
  toggleBuilderPublishAction,
  type BulkBuilderOperation,
} from "@/lib/actions/builders";
import ConfirmButton from "./ConfirmButton";

export interface BuilderRow {
  id: string;
  name: string;
  headquarters: string | null;
  logoUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  _count: { projects: number };
}

export default function BuildersTable({ builders }: { builders: BuilderRow[] }) {
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
    setSelected((prev) => (prev.size === builders.length ? new Set() : new Set(builders.map((b) => b.id))));
  }

  function runBulk(operation: BulkBuilderOperation) {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkBuilderAction(Array.from(selected), operation);
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
    <div className="flex flex-col gap-2">
      {selected.size > 0 ? (
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
              if (window.confirm(`Delete ${selected.size} builder(s)? This cannot be undone.`)) runBulk("delete");
            }}
            className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
          >
            Delete
          </button>
          {bulkError ? <span className="text-[11px] text-negative">{bulkError}</span> : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
              <th className="w-8 px-3 py-2">
                <input type="checkbox" checked={selected.size === builders.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
              </th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Headquarters</th>
              <th className="px-3 py-2 font-medium">Projects</th>
              <th className="px-3 py-2 font-medium">Published</th>
              <th className="px-3 py-2 font-medium">Featured</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {builders.map((builder) => (
              <tr key={builder.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(builder.id)} onChange={() => toggleOne(builder.id)} className="h-3.5 w-3.5 accent-accent" />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/builders/${builder.id}/edit`} className="font-mono text-foreground hover:text-accent">
                    {builder.name}
                  </Link>
                  {builder.isArchived ? (
                    <span className="ml-1.5 rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase text-muted">Archived</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-muted">{builder.headquarters ?? "--"}</td>
                <td className="px-3 py-2 font-mono text-muted">{builder._count.projects}</td>
                <td className="px-3 py-2">
                  <ToggleButton
                    active={builder.isPublished}
                    activeLabel="Published"
                    inactiveLabel="Draft"
                    onToggle={() => toggleBuilderPublishAction(builder.id, !builder.isPublished).then(() => router.refresh())}
                  />
                </td>
                <td className="px-3 py-2">
                  <ToggleButton
                    active={builder.isFeatured}
                    activeLabel="Featured"
                    inactiveLabel="Standard"
                    onToggle={() => toggleBuilderFeaturedAction(builder.id, !builder.isFeatured).then(() => router.refresh())}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/admin/builders/${builder.id}/edit`}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(builder.id)}
                      disabled={isPending}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBuilderArchiveAction(builder.id, !builder.isArchived).then(() => router.refresh())}
                      className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                    >
                      {builder.isArchived ? "Unarchive" : "Archive"}
                    </button>
                    <ConfirmButton action={deleteBuilderAction.bind(null, builder.id)} />
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
