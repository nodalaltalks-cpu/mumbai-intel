"use client";

import { useActionState } from "react";
import { requestPhoneVerificationAction, type PhoneVerificationState } from "@/lib/actions/phone-verification";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: PhoneVerificationState = {};

export default function PhoneVerificationCard({ verified }: { verified: boolean }) {
  const [state, formAction] = useActionState(requestPhoneVerificationAction, initialState);

  if (verified) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-positive">
        <span aria-hidden="true">✓</span> Phone verified
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-sm border border-border bg-background p-3">
      <p className="text-xs text-foreground">Want faster updates on new launches, offers and availability?</p>
      <p className="mt-1 text-[11px] text-muted">
        You can optionally verify your phone number to receive relevant updates from us. Your number is optional and will not be required to
        research properties. We&apos;ll never share it with brokers or developers.
      </p>
      <form action={formAction} className="mt-2">
        <AuthError message={state.error} />
        <AuthSuccess message={state.success} />
        <AuthButton pendingText="Requesting...">Request verification</AuthButton>
      </form>
    </div>
  );
}
