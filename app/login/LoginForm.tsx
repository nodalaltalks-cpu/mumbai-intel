"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type PublicAuthState } from "@/lib/actions/public-auth";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import GoogleButton from "@/app/components/auth/GoogleButton";
import { AuthDivider, AuthError } from "@/app/components/auth/AuthMessage";

const initialState: PublicAuthState = {};

export default function LoginForm({ googleError, next }: { googleError?: string; next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <div className="flex flex-col gap-5">
      <GoogleButton next={next} />
      <AuthDivider />

      <form action={formAction} className="flex flex-col gap-4">
        <AuthError message={state.error ?? googleError} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <AuthField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        <div className="flex flex-col gap-1.5">
          <AuthField label="Password" name="password" type="password" required autoComplete="current-password" />
          <Link href="/forgot-password" className="self-end text-xs font-medium text-muted hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <AuthButton pendingText="Signing in…">Sign in</AuthButton>
      </form>
    </div>
  );
}
