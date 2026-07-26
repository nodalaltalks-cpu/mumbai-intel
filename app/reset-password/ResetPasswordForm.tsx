"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type PublicAuthState } from "@/lib/actions/public-auth";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: PublicAuthState = {};

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <AuthSuccess message={state.success} />
        <Link href="/login" className="text-center text-sm font-medium text-foreground hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <AuthField label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 8 characters" minLength={8} />
      <AuthButton pendingText="Resetting…">Reset password</AuthButton>
    </form>
  );
}
