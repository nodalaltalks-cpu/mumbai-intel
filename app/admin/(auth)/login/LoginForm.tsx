"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Field, FormError } from "@/app/admin/components/FormField";
import SubmitButton from "@/app/admin/components/SubmitButton";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <Field label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      <Field label="Password" name="password" type="password" required autoComplete="current-password" />
      <SubmitButton pendingText="Signing in..." className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
