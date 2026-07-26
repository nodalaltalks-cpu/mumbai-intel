"use client";

import { useActionState } from "react";
import { addBuilderScoreSnapshotAction, deleteBuilderScoreSnapshotAction } from "@/lib/actions/builders";
import { Field } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";
import { formatDate } from "@/lib/format";

export interface ScoreSnapshotRow {
  id: string;
  asOf: Date;
  overallScore: number | string;
  onTimeDeliveryPct: number | string | null;
  deliveredProjects: number;
  activeProjects: number;
  litigationFlags: number;
  methodologyVersion: string;
}

export default function BuilderScoreManager({ builderId, snapshots }: { builderId: string; snapshots: ScoreSnapshotRow[] }) {
  const action = addBuilderScoreSnapshotAction.bind(null, builderId);
  const [state, formAction] = useActionState(action, { error: undefined });

  const latest = snapshots[0];

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Trust score (Builder Delivery Record)</h3>
      <p className="mt-1 text-xs text-muted">Versioned snapshots — never overwritten, so score history stays reproducible.</p>

      {latest ? (
        <div className="mt-3 flex items-center gap-4 rounded-sm border border-accent/30 bg-accent/5 px-3 py-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Current score</p>
            <p className="font-mono text-xl font-semibold text-accent">{Number(latest.overallScore).toFixed(1)}/10</p>
          </div>
          <div className="text-xs text-muted">
            <p>On-time delivery: {latest.onTimeDeliveryPct !== null ? `${Number(latest.onTimeDeliveryPct).toFixed(0)}%` : "--"}</p>
            <p>Delivered {latest.deliveredProjects} · Active {latest.activeProjects} · Litigation flags {latest.litigationFlags}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No score recorded yet.</p>
      )}

      {snapshots.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {snapshots.map((s) => (
            <li key={s.id} className="flex items-center justify-between border-t border-border pt-1.5 text-xs first:border-t-0 first:pt-0">
              <span className="font-mono text-muted">
                {formatDate(s.asOf)} · {Number(s.overallScore).toFixed(1)}/10 · {s.methodologyVersion}
              </span>
              <ConfirmButton action={deleteBuilderScoreSnapshotAction.bind(null, s.id)} />
            </li>
          ))}
        </ul>
      ) : null}

      <form action={formAction} className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
        <Field label="As of" name="asOf" type="date" required />
        <Field label="Overall score (0-10)" name="overallScore" type="number" step="0.1" min={0} max={10} required />
        <Field label="On-time delivery %" name="onTimeDeliveryPct" type="number" step="any" min={0} max={100} />
        <Field label="Avg delay (months)" name="avgDelayMonths" type="number" step="any" min={0} />
        <Field label="Delivered projects" name="deliveredProjects" type="number" min={0} />
        <Field label="Active projects" name="activeProjects" type="number" min={0} />
        <Field label="Litigation flags" name="litigationFlags" type="number" min={0} />
        <Field label="Methodology version" name="methodologyVersion" placeholder="v1" required />
        <div className="col-span-2 sm:col-span-4">
          <SubmitButton pendingText="Adding...">Add snapshot</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
