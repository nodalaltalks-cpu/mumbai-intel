"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createInfraAssetAction } from "@/lib/actions/infra-assets";
import { INFRA_TYPES, INFRA_TYPE_LABEL } from "@/lib/project-meta";
import { Field, SelectField } from "./FormField";
import SubmitButton from "./SubmitButton";

export default function CatalogueInfraAssetForm({ cityId }: { cityId: string }) {
  const router = useRouter();
  const action = createInfraAssetAction.bind(null, cityId);
  const [state, formAction] = useActionState(action, { error: undefined });
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (!state.error) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-sm border border-dashed border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">Catalogue a new nearby place</p>
      <p className="mt-1 text-[11px] text-muted">
        Adds to the shared city catalogue with coordinates — it will automatically appear as &quot;nearby&quot; for this and
        any other locality or project within range once saved.
      </p>
      <form action={formAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SelectField label="Type" name="type" defaultValue={INFRA_TYPES[0]}>
          {INFRA_TYPES.map((t) => (
            <option key={t} value={t}>
              {INFRA_TYPE_LABEL[t]}
            </option>
          ))}
        </SelectField>
        <div className="col-span-2 sm:col-span-2">
          <Field label="Name" name="name" placeholder="Bandra Park" required />
        </div>
        <Field label="Latitude" name="latitude" type="number" step="any" required />
        <Field label="Longitude" name="longitude" type="number" step="any" required />
        <div className="col-span-2 sm:col-span-5">
          <SubmitButton pendingText="Adding...">Catalogue place</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
