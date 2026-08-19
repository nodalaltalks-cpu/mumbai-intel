"use client";

import { useActionState } from "react";
import { updateSiteSettingsAction, type SiteSettingsState } from "@/lib/actions/settings";
import { Field, FormError } from "./FormField";
import SubmitButton from "./SubmitButton";

const initialState: SiteSettingsState = {};

export default function SiteSettingsForm({ googleUrl, appStoreUrl }: { googleUrl: string; appStoreUrl: string }) {
  const [state, formAction] = useActionState(updateSiteSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      {state.success ? (
        <div className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">Settings updated successfully.</div>
      ) : null}
      <Field label="Google review link" name="review_google_url" type="url" defaultValue={googleUrl} placeholder="https://g.page/r/…/review" />
      <Field label="App Store review link" name="review_appstore_url" type="url" defaultValue={appStoreUrl} placeholder="https://apps.apple.com/…" />
      <div>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
