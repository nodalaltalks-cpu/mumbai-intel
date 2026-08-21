"use client";

import { useActionState } from "react";
import { updateNotificationPreferencesAction, type NotificationPreferencesFormState } from "@/lib/actions/user-preferences";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: NotificationPreferencesFormState = {};

export default function NotificationPreferencesForm({
  preferences,
}: {
  preferences: { savedSearchAlerts: boolean; weeklyDigest: boolean; productUpdates: boolean } | null;
}) {
  const [state, formAction] = useActionState(updateNotificationPreferencesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        These are stored for when saved-search alerts and email digests launch. No notification is sent by anything
        on the platform yet, so nothing will land in your inbox from toggling these today.
      </p>
      <div className="flex flex-col gap-2.5">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="savedSearchAlerts"
            defaultChecked={preferences?.savedSearchAlerts ?? true}
            className="h-4 w-4 accent-accent"
          />
          Alert me when a saved search finds a new match
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="weeklyDigest" defaultChecked={preferences?.weeklyDigest ?? true} className="h-4 w-4 accent-accent" />
          Weekly market intelligence digest
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="productUpdates"
            defaultChecked={preferences?.productUpdates ?? false}
            className="h-4 w-4 accent-accent"
          />
          Product updates and new features
        </label>
      </div>

      <AuthError message={state.error} />
      <AuthSuccess message={state.success} />
      <AuthButton pendingText="Saving...">Save notification settings</AuthButton>
    </form>
  );
}
