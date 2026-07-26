"use client";

import { useActionState } from "react";
import { addMicroMarketAction, deleteMicroMarketAction } from "@/lib/actions/micromarkets";
import { Field } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface MicroMarketRow {
  id: string;
  name: string;
}

export default function MicroMarketManager({ localityId, microMarkets }: { localityId: string; microMarkets: MicroMarketRow[] }) {
  const action = addMicroMarketAction.bind(null, localityId);
  const [state, formAction] = useActionState(action, { error: undefined });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Micro markets</h3>
      <p className="mt-1 text-xs text-muted">Finer-than-locality pockets (e.g. Pali Hill within Bandra West) — selectable when editing a project.</p>

      {microMarkets.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {microMarkets.map((mm) => (
            <li key={mm.id} className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground">
              {mm.name}
              <ConfirmButton action={deleteMicroMarketAction.bind(null, mm.id)} label="×" className="px-1 py-0" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No micro markets added yet.</p>
      )}

      <form action={formAction} className="mt-4 flex items-end gap-3 border-t border-border pt-4">
        <div className="flex-1">
          <Field label="Micro market name" name="name" placeholder="Pali Hill" required />
        </div>
        <SubmitButton pendingText="Adding...">Add</SubmitButton>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
