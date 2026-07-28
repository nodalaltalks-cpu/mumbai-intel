"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

export interface TrashItem {
  id: string;
  label: string;
  sublabel?: string;
  deletedAt: Date;
  deletedByName: string | null;
}

export default function TrashPanel({
  items,
  isAdmin,
  restoreAction,
  permanentDeleteAction,
  bulkAction,
  emptyTrashAction,
}: {
  items: TrashItem[];
  isAdmin: boolean;
  restoreAction: (id: string) => Promise<{ error?: string }>;
  permanentDeleteAction: (id: string) => Promise<{ error?: string }>;
  bulkAction: (ids: string[], operation: "restore" | "permanent-delete") => Promise<{ error?: string; affected?: number }>;
  emptyTrashAction: () => Promise<{ error?: string; affected?: number }>;
}) {
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
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  function runBulk(operation: "restore" | "permanent-delete") {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkAction(Array.from(selected), operation);
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function runEmptyTrash() {
    if (!window.confirm(`Permanently delete all ${items.length} item(s) in this Trash? This cannot be undone.`)) return;
    setBulkError(null);
    startTransition(async () => {
      const result = await emptyTrashAction();
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Trash is empty</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2">
              <span className="text-xs text-foreground">{selected.size} selected</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => runBulk("restore")}
                className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-positive hover:text-positive"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm(`Permanently delete ${selected.size} item(s)? This cannot be undone.`)) runBulk("permanent-delete");
                }}
                className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase text-muted hover:border-negative hover:text-negative"
              >
                Permanently Delete
              </button>
              {bulkError ? <span className="text-[11px] text-negative">{bulkError}</span> : null}
            </div>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={runEmptyTrash}
            className="ml-auto rounded-sm border border-negative/40 px-3 py-2 text-[11px] font-mono uppercase tracking-wide text-negative hover:bg-negative/10"
          >
            Empty Trash
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
              {isAdmin ? (
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-accent" />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Deleted</th>
              <th className="px-3 py-2 font-medium">Deleted By</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                {isAdmin ? (
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} className="h-3.5 w-3.5 accent-accent" />
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <span className="font-mono text-foreground">{item.label}</span>
                  {item.sublabel ? <p className="text-[11px] text-muted">{item.sublabel}</p> : null}
                </td>
                <td className="px-3 py-2 text-muted">{formatDate(item.deletedAt)}</td>
                <td className="px-3 py-2 text-muted">{item.deletedByName ?? "--"}</td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await restoreAction(item.id);
                            if (result.error) {
                              setBulkError(result.error);
                              return;
                            }
                            router.refresh();
                          })
                        }
                        className="rounded-sm border border-border px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-positive hover:text-positive disabled:opacity-60"
                      >
                        Restore
                      </button>
                      <ConfirmButton action={permanentDeleteAction.bind(null, item.id)} label="Delete Forever" />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
