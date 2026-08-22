"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { reauthenticateForTrashAction, type TrashReauthState } from "@/lib/actions/trash-auth";
import SubmitButton from "./SubmitButton";

const initialState: TrashReauthState = {};

/** Rendered instead of Trash content whenever the server-side check (hasValidTrashReauth) fails — confirming here re-runs that check server-side on refresh, it never flips a client-only flag. */
export default function TrashReauthGate() {
  const router = useRouter();
  const [state, formAction] = useActionState(reauthenticateForTrashAction, initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-border bg-surface py-16">
      <div className="text-center">
        <p className="font-mono text-sm font-semibold text-foreground">Confirm it&apos;s you</p>
        <p className="mt-1 max-w-xs text-xs text-muted">Trash contains deleted records. Re-enter your password to continue — this stays valid for 10 minutes.</p>
      </div>
      <form action={formAction} className="flex w-full max-w-xs flex-col gap-2">
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {state.error ? <p className="text-[11px] text-negative">{state.error}</p> : null}
        <SubmitButton pendingText="Checking…">Continue</SubmitButton>
      </form>
    </div>
  );
}
