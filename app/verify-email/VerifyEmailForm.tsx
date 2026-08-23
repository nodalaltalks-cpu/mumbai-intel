"use client";

import Link from "next/link";
import { useActionState } from "react";
import { verifyEmailAction, type EmailVerificationState } from "@/lib/actions/email-verification";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: EmailVerificationState = {};

/** Requires an explicit click rather than verifying on page load — email link-scanners/previewers can otherwise silently consume a single-use token before the person ever sees this page. */
export default function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(verifyEmailAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <AuthSuccess message={state.success} />
        <Link href="/account?tab=profile" className="text-center text-sm font-medium text-foreground hover:underline">
          Back to your profile
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <AuthButton pendingText="Verifying…">Confirm my email</AuthButton>
    </form>
  );
}
