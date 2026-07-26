"use client";

import { useActionState } from "react";
import {
  addProjectSpecificationAction,
  deleteProjectSpecificationAction,
} from "@/lib/actions/project-specifications";
import { Field } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface SpecificationRow {
  id: string;
  category: string;
  detail: string;
}

export default function SpecificationsManager({ projectId, specifications }: { projectId: string; specifications: SpecificationRow[] }) {
  const action = addProjectSpecificationAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  const grouped = specifications.reduce<Record<string, SpecificationRow[]>>((acc, spec) => {
    (acc[spec.category] ??= []).push(spec);
    return acc;
  }, {});

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Specifications</h3>
      <p className="mt-1 text-xs text-muted">Construction and material specs, grouped by category.</p>

      {Object.keys(grouped).length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {Object.entries(grouped).map(([category, rows]) => (
            <div key={category}>
              <p className="font-mono text-[11px] uppercase tracking-wide text-accent">{category}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
                    <span className="text-xs text-foreground">{row.detail}</span>
                    <ConfirmButton action={deleteProjectSpecificationAction.bind(null, row.id)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No specifications added yet.</p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Category" name="category" placeholder="Structure" required />
        </div>
        <div className="flex-[2]">
          <Field label="Detail" name="detail" placeholder="RCC shear wall frame" required />
        </div>
        <SubmitButton pendingText="Adding...">Add</SubmitButton>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
