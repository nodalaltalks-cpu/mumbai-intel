"use client";

import { useActionState } from "react";
import { updatePreferencesAction, type PreferencesFormState } from "@/lib/actions/user-preferences";
import { CATEGORY_LABEL, PROPERTY_CATEGORIES, type PropertyCategory } from "@/lib/project-meta";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: PreferencesFormState = {};

export default function PreferencesForm({
  preferences,
  localities,
}: {
  preferences: {
    preferredBudgetMinRupees: number | null;
    preferredBudgetMaxRupees: number | null;
    preferredCategory: PropertyCategory | null;
    preferredLocalityIds: string[];
  } | null;
  localities: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(updatePreferencesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Collected for future personalization (a personalized home feed, tailored recommendations) — nothing on the
        site changes based on these yet, but saving them now means you won&apos;t have to re-enter them later.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <AuthField
          label="Budget min (₹)"
          name="preferredBudgetMinRupees"
          type="number"
          min={0}
          defaultValue={preferences?.preferredBudgetMinRupees ?? ""}
        />
        <AuthField
          label="Budget max (₹)"
          name="preferredBudgetMaxRupees"
          type="number"
          min={0}
          defaultValue={preferences?.preferredBudgetMaxRupees ?? ""}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Preferred category</span>
        <select
          name="preferredCategory"
          defaultValue={preferences?.preferredCategory ?? ""}
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">No preference</option>
          {PROPERTY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Preferred localities</legend>
        <div className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-3">
          {localities.map((l) => (
            <label key={l.id} className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                name="preferredLocalityIds"
                value={l.id}
                defaultChecked={preferences?.preferredLocalityIds.includes(l.id)}
                className="h-3.5 w-3.5 accent-accent"
              />
              {l.name}
            </label>
          ))}
        </div>
      </fieldset>

      <AuthError message={state.error} />
      <AuthSuccess message={state.success} />
      <AuthButton pendingText="Saving...">Save preferences</AuthButton>
    </form>
  );
}
