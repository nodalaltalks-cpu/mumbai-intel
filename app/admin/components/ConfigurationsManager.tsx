"use client";

import { useActionState, useState } from "react";
import {
  addConfigurationAction,
  deleteConfigurationAction,
  updateConfigurationAction,
  type ConfigurationActionState,
} from "@/lib/actions/configurations";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";
import { Field } from "./FormField";

export interface ConfigurationRow {
  id: string;
  label: string;
  bedrooms: number;
  carpetSqft: number | null;
  builtUpSqft: number | null;
  priceMinPaise: bigint | null;
  priceMaxPaise: bigint | null;
}

const initialState: ConfigurationActionState = {};

export default function ConfigurationsManager({
  projectId,
  configurations,
}: {
  projectId: string;
  configurations: ConfigurationRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = configurations.find((c) => c.id === editingId) ?? null;

  const action = editingId ? updateConfigurationAction.bind(null, editingId, projectId) : addConfigurationAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Unit configurations</h3>
      <p className="mt-1 text-xs text-muted">
        2 BHK / 3 BHK breakdown with carpet area. Pricing lives in the Pricing tab — not entered twice here.
      </p>

      {configurations.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-2.5 py-1.5 font-medium">Label</th>
                <th className="px-2.5 py-1.5 font-medium">Carpet sqft</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configurations.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-1.5 font-mono text-foreground">{c.label}</td>
                  <td className="px-2.5 py-1.5 text-muted">{c.carpetSqft ?? "--"}</td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(c.id)}
                        className="text-[11px] font-mono uppercase tracking-wide text-accent hover:underline"
                      >
                        Edit
                      </button>
                      <ConfirmButton action={deleteConfigurationAction.bind(null, c.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No configurations added yet.</p>
      )}

      <form key={editingId ?? "new"} action={formAction} className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Label" name="label" placeholder="2 BHK" required defaultValue={editingRow?.label ?? ""} />
        </div>
        <Field label="Bedrooms" name="bedrooms" type="number" step="0.5" min={0} required defaultValue={editingRow?.bedrooms ?? ""} />
        <Field label="Carpet sqft" name="carpetSqft" type="number" step="any" min={0} defaultValue={editingRow?.carpetSqft ?? ""} />
        <div className="flex items-end gap-2 sm:col-span-4">
          <SubmitButton pendingText={editingId ? "Saving..." : "Adding..."}>{editingId ? "Save changes" : "Add configuration"}</SubmitButton>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-sm border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p>
      ) : null}
    </div>
  );
}
