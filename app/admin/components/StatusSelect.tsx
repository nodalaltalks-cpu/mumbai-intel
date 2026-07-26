"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProjectStatusAction } from "@/lib/actions/projects";
import { PROJECT_STATUSES, STATUS_LABEL, type ProjectStatus } from "@/lib/project-meta";

export default function StatusSelect({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ProjectStatus;
    setError(null);
    setValue(next);
    startTransition(async () => {
      const result = await updateProjectStatusAction(projectId, next);
      if (result.error) {
        setError(result.error);
        setValue(status);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={value}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-sm border border-border bg-surface px-1.5 py-1 font-mono text-[11px] text-foreground focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {PROJECT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
