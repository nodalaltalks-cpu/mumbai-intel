"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  reauthenticateForTrashAction,
  setupTrashPasswordAction,
  resetTrashPasswordAction,
  type TrashReauthState,
} from "@/lib/actions/trash-auth";
import SubmitButton from "./SubmitButton";

const initialState: TrashReauthState = {};

type Mode = "enter" | "forgot";

/** Rendered instead of Trash content whenever the server-side check (hasValidTrashReauth) fails — confirming here re-runs that check server-side on refresh, it never flips a client-only flag. */
export default function TrashReauthGate({ hasTrashPassword }: { hasTrashPassword: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("enter");
  const [enterState, enterAction] = useActionState(reauthenticateForTrashAction, initialState);
  const [setupState, setupAction] = useActionState(setupTrashPasswordAction, initialState);
  const [resetState, resetAction] = useActionState(resetTrashPasswordAction, initialState);

  useEffect(() => {
    if (enterState.success || setupState.success || resetState.success) router.refresh();
  }, [enterState.success, setupState.success, resetState.success, router]);

  if (!hasTrashPassword) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-border bg-surface py-16">
        <div className="text-center">
          <p className="font-mono text-sm font-semibold text-foreground">Set up your Trash password</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Trash needs its own password, separate from your login password. Confirm your login password once to set it up.
          </p>
        </div>
        <form action={setupAction} className="flex w-full max-w-xs flex-col gap-2">
          <input
            type="password"
            name="loginPassword"
            autoFocus
            placeholder="Your login password"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            name="newPassword"
            placeholder="New Trash password (min. 8 characters)"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Trash password"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {setupState.error ? <p className="text-[11px] text-negative">{setupState.error}</p> : null}
          <SubmitButton pendingText="Setting up…">Set Trash password</SubmitButton>
        </form>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-border bg-surface py-16">
        <div className="text-center">
          <p className="font-mono text-sm font-semibold text-foreground">Reset your Trash password</p>
          <p className="mt-1 max-w-xs text-xs text-muted">Confirm your login password to set a new Trash password.</p>
        </div>
        <form action={resetAction} className="flex w-full max-w-xs flex-col gap-2">
          <input
            type="password"
            name="loginPassword"
            autoFocus
            placeholder="Your login password"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            name="newPassword"
            placeholder="New Trash password (min. 8 characters)"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm new Trash password"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {resetState.error ? <p className="text-[11px] text-negative">{resetState.error}</p> : null}
          <SubmitButton pendingText="Resetting…">Reset Trash password</SubmitButton>
          <button type="button" onClick={() => setMode("enter")} className="text-[11px] text-muted hover:text-accent hover:underline">
            Back to entering your Trash password
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-border bg-surface py-16">
      <div className="text-center">
        <p className="font-mono text-sm font-semibold text-foreground">Confirm it&apos;s you</p>
        <p className="mt-1 max-w-xs text-xs text-muted">Trash contains deleted records. Enter your Trash password to continue — this stays valid for 10 minutes.</p>
      </div>
      <form action={enterAction} className="flex w-full max-w-xs flex-col gap-2">
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Trash password"
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {enterState.error ? <p className="text-[11px] text-negative">{enterState.error}</p> : null}
        <SubmitButton pendingText="Checking…">Continue</SubmitButton>
        <button type="button" onClick={() => setMode("forgot")} className="text-[11px] text-muted hover:text-accent hover:underline">
          Forgot Trash password?
        </button>
      </form>
    </div>
  );
}
