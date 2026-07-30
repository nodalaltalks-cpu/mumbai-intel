"use client";

import { useActionState } from "react";
import { updatePublicProfileAction, type ProfileFormState } from "@/lib/actions/public-profile";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: ProfileFormState = {};

export default function ProfileForm({ name, phone }: { name: string | null; phone: string | null }) {
  const [state, formAction] = useActionState(updatePublicProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AuthField label="Name" name="name" defaultValue={name ?? ""} placeholder="Your name" />
        <AuthField label="Phone" name="phone" type="tel" defaultValue={phone ?? ""} placeholder="+91 98765 43210" />
      </div>
      <AuthError message={state.error} />
      <AuthSuccess message={state.success} />
      <AuthButton pendingText="Saving...">Save profile</AuthButton>
    </form>
  );
}
