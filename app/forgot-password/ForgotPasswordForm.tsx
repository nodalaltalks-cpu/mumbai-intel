"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type PublicAuthState } from "@/lib/actions/public-auth";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: PublicAuthState = {};

export default function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);

  if (state.success) return <AuthSuccess message={state.success} />;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthError message={state.error} />
      <AuthField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      <AuthButton pendingText="Sending…">Send reset link</AuthButton>
    </form>
  );
}
