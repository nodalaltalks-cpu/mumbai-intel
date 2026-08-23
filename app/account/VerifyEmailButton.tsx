"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestEmailVerificationAction, type EmailVerificationState } from "@/lib/actions/email-verification";
import Button from "@/app/components/ui/Button";

const initialState: EmailVerificationState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Verify my email"}
    </Button>
  );
}

export default function VerifyEmailButton({ verified }: { verified: boolean }) {
  const [state, formAction] = useActionState(requestEmailVerificationAction, initialState);

  if (verified) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-positive">
        <span aria-hidden="true">✓</span> Email verified
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {state.error ? <p className="text-[11px] text-negative">{state.error}</p> : null}
      {state.success ? <p className="text-[11px] text-positive">{state.success}</p> : <SubmitButton />}
    </form>
  );
}
