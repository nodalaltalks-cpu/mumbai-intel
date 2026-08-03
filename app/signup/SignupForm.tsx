"use client";

import { useActionState } from "react";
import { signupAction, type PublicAuthState } from "@/lib/actions/public-auth";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import GoogleButton from "@/app/components/auth/GoogleButton";
import { AuthDivider, AuthError } from "@/app/components/auth/AuthMessage";

const initialState: PublicAuthState = {};

export default function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <div className="flex flex-col gap-5">
      <GoogleButton next={next} />
      <AuthDivider />

      <form action={formAction} className="flex flex-col gap-4">
        <AuthError message={state.error} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <AuthField label="Full name" name="name" type="text" required autoComplete="name" placeholder="Priya Sharma" />
        <AuthField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        <AuthField label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 8 characters" minLength={8} />
        <AuthButton pendingText="Creating account…">Create account</AuthButton>
        <p className="text-center text-xs text-muted">By continuing you agree to our Terms and Privacy Policy.</p>
      </form>
    </div>
  );
}
