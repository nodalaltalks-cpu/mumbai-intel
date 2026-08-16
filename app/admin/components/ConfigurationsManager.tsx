"use client";

import { useActionState, useState } from "react";
import {
  addConfigurationAction,
  deleteConfigurationAction,
  type ConfigurationActionState,
} from "@/lib/actions/configurations";
import ConfirmButton from "./ConfirmButton";
import SubmitButton from "./SubmitButton";
import { Field } from "./FormField";
import PriceAmountField from "./PriceAmountField";
import { amountUnitToRupees, type PriceUnit } from "@/lib/price-units";

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
  const action = addConfigurationAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, initialState);
  const [priceMinAmount, setPriceMinAmount] = useState("");
  const [priceMinUnit, setPriceMinUnit] = useState<PriceUnit>("cr");
  const [priceMaxAmount, setPriceMaxAmount] = useState("");
  const [priceMaxUnit, setPriceMaxUnit] = useState<PriceUnit>("cr");

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Unit configurations</h3>
      <p className="mt-1 text-xs text-muted">2 BHK / 3 BHK breakdown with carpet area and price band.</p>

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
                    <div className="flex justify-end">
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

      <form action={formAction} className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Field label="Label" name="label" placeholder="2 BHK" required />
        </div>
        <Field label="Bedrooms" name="bedrooms" type="number" step="0.5" min={0} required />
        <Field label="Carpet sqft" name="carpetSqft" type="number" step="any" min={0} />
        <PriceAmountField
          label="Price min"
          name="priceMinRupees"
          amount={priceMinAmount}
          unit={priceMinUnit}
          onAmountChange={setPriceMinAmount}
          onUnitChange={setPriceMinUnit}
          rupees={amountUnitToRupees(priceMinAmount, priceMinUnit)}
        />
        <PriceAmountField
          label="Price max"
          name="priceMaxRupees"
          amount={priceMaxAmount}
          unit={priceMaxUnit}
          onAmountChange={setPriceMaxAmount}
          onUnitChange={setPriceMaxUnit}
          rupees={amountUnitToRupees(priceMaxAmount, priceMaxUnit)}
        />
        <div className="sm:col-span-6">
          <SubmitButton pendingText="Adding...">Add configuration</SubmitButton>
        </div>
      </form>
      {state.error ? (
        <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p>
      ) : null}
    </div>
  );
}
