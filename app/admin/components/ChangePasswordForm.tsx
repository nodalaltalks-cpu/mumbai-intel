"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction, type ChangePasswordState } from "@/lib/actions/settings";
import { Field, FormError } from "./FormField";
import SubmitButton from "./SubmitButton";

const initialState: ChangePasswordState = {};

export default function ChangePasswordForm() {
  const [state, formAction] = useActionState(changeOwnPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      {state.success ? (
        <div className="rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">
          Password updated successfully.
        </div>
      ) : null}
      <Field label="Current password" name="currentPassword" type="password" required />
      <Field label="New password" name="newPassword" type="password" required hint="Minimum 8 characters" />
      <Field label="Confirm new password" name="confirmPassword" type="password" required />
      <div>
        <SubmitButton>Update password</SubmitButton>
      </div>
    </form>
  );
}
