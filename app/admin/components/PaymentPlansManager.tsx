"use client";

import { useActionState, useState } from "react";
import {
  addPaymentMilestoneAction,
  deletePaymentMilestoneAction,
  updatePaymentMilestoneAction,
  type PaymentMilestoneActionState,
} from "@/lib/actions/payment-milestones";
import { PAYMENT_MILESTONE_PRESETS } from "@/lib/project-meta";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";
import { Field } from "./FormField";
import PriceAmountField from "./PriceAmountField";
import { amountUnitToRupees, rupeesToAmountUnit, type PriceUnit } from "@/lib/price-units";
import { formatPaise } from "@/lib/format";

export interface PaymentMilestoneRow {
  id: string;
  label: string;
  percentage: number | null;
  amountPaise: number | null;
  isCustom: boolean;
}

const initialState: PaymentMilestoneActionState = {};

/**
 * Granular payment schedule (Booking/Agreement/Plinth/... or a fully custom
 * milestone), separate from Project.paymentPlanType/paymentPlanDescription
 * (the overall plan category + free-text summary in the Pricing tab, which
 * stays as-is) — developers vary milestone-by-milestone, so each entry here
 * is its own addable/editable/deletable row.
 */
export default function PaymentPlansManager({ projectId, milestones }: { projectId: string; milestones: PaymentMilestoneRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = milestones.find((m) => m.id === editingId) ?? null;

  const action = editingId ? updatePaymentMilestoneAction.bind(null, editingId, projectId) : addPaymentMilestoneAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);

  const editingAmount = editingRow?.amountPaise ? rupeesToAmountUnit(Number(editingRow.amountPaise) / 100) : null;
  const [amount, setAmount] = useState(editingAmount?.amount ?? "");
  const [unit, setUnit] = useState<PriceUnit>(editingAmount?.unit ?? "cr");
  const [label, setLabel] = useState(editingRow?.label ?? "");

  function startEdit(row: PaymentMilestoneRow) {
    setEditingId(row.id);
    setLabel(row.label);
    if (row.amountPaise) {
      const converted = rupeesToAmountUnit(Number(row.amountPaise) / 100);
      setAmount(converted.amount);
      setUnit(converted.unit);
    } else {
      setAmount("");
      setUnit("cr");
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setLabel("");
    setAmount("");
    setUnit("cr");
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Payment plan</h3>
      <p className="mt-1 text-xs text-muted">Individual milestones — developers structure these differently, so each is its own entry.</p>

      {milestones.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted">
                <th className="px-2.5 py-1.5 font-medium">Milestone</th>
                <th className="px-2.5 py-1.5 font-medium">Percentage</th>
                <th className="px-2.5 py-1.5 font-medium">Amount</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-1.5 font-mono text-foreground">
                    {m.label} {m.isCustom ? <span className="ml-1 rounded-sm border border-border px-1 text-[9px] text-muted">custom</span> : null}
                  </td>
                  <td className="px-2.5 py-1.5 text-muted">{m.percentage !== null ? `${m.percentage}%` : "--"}</td>
                  <td className="px-2.5 py-1.5 text-muted">{m.amountPaise !== null ? formatPaise(m.amountPaise) : "--"}</td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="text-[11px] font-mono uppercase tracking-wide text-accent hover:underline"
                      >
                        Edit
                      </button>
                      <ConfirmButton action={deletePaymentMilestoneAction.bind(null, m.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">No payment milestones added yet.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
        {PAYMENT_MILESTONE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setLabel(preset)}
            className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
          >
            + {preset}
          </button>
        ))}
      </div>

      <form key={editingId ?? "new"} action={formAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Field label="Milestone / custom text" name="label" placeholder="e.g. Booking, or a fully custom entry" required value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <Field label="Percentage" name="percentage" type="number" step="0.01" min={0} max={100} defaultValue={editingRow?.percentage ?? ""} />
        <div className="sm:col-span-2">
          <PriceAmountField label="Amount (optional)" name="amountRupees" amount={amount} unit={unit} onAmountChange={setAmount} onUnitChange={setUnit} rupees={amountUnitToRupees(amount, unit)} />
        </div>
        <div className="flex items-end gap-2 sm:col-span-1">
          <SubmitButton pendingText={editingId ? "Saving..." : "Adding..."}>{editingId ? "Save changes" : "Add"}</SubmitButton>
          {editingId ? (
            <button type="button" onClick={cancelEdit} className="rounded-sm border border-border px-2 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted hover:border-negative hover:text-negative">
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      {state.error ? <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
