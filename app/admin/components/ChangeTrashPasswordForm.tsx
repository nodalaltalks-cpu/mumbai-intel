"use client";

import { useActionState } from "react";
import { changeTrashPasswordAction, type TrashReauthState } from "@/lib/actions/trash-auth";
import { Field, FormError } from "./FormField";
import SubmitButton from "./SubmitButton";

const initialState: TrashReauthState = {};

export default function ChangeTrashPasswordForm() {
  const [state, formAction] = useActionState(changeTrashPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      {state.success ? (
        <div className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">Trash password updated successfully.</div>
      ) : null}
      <Field label="Current Trash password" name="currentPassword" type="password" required />
      <Field label="New Trash password" name="newPassword" type="password" required hint="Minimum 8 characters" />
      <Field label="Confirm new Trash password" name="confirmPassword" type="password" required />
      <div>
        <SubmitButton>Update Trash password</SubmitButton>
      </div>
    </form>
  );
}
