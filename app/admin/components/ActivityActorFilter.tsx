"use client";

import { useRouter } from "next/navigation";

/**
 * Small client boundary just for the actor dropdown's navigation — the rest
 * of the Activity page stays a server component. Takes the current filter
 * state as plain data (baseParams) rather than a callback, since Server
 * Components can't pass functions to Client Components across the RSC
 * boundary — the href is built here instead.
 */
export default function ActivityActorFilter({
  actors,
  currentActorId,
  baseParams,
}: {
  actors: { id: string; name: string | null; email: string }[];
  currentActorId?: string;
  baseParams: { period?: string; from?: string; to?: string; entityType?: string };
}) {
  const router = useRouter();

  function hrefFor(actorId?: string): string {
    const qs = new URLSearchParams();
    if (baseParams.period) qs.set("period", baseParams.period);
    if (baseParams.from) qs.set("from", baseParams.from);
    if (baseParams.to) qs.set("to", baseParams.to);
    if (baseParams.entityType) qs.set("entityType", baseParams.entityType);
    if (actorId) qs.set("actorId", actorId);
    return `/admin/activity?${qs.toString()}`;
  }

  return (
    <select
      defaultValue={currentActorId ?? ""}
      onChange={(e) => router.push(hrefFor(e.target.value || undefined))}
      className="rounded-sm border border-border bg-background px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted focus:border-accent focus:outline-none"
    >
      <option value="">Any actor</option>
      {actors.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name ?? a.email}
        </option>
      ))}
    </select>
  );
}
