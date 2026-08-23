"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updatePublicProfileAction, type ProfileFormState } from "@/lib/actions/public-profile";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";
import PhoneVerificationCard from "./PhoneVerificationCard";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const initialState: ProfileFormState = {};

export default function ProfileForm({
  name,
  phone,
  city,
  currentLocality,
  phoneVerified,
}: {
  name: string | null;
  phone: string | null;
  city: string | null;
  currentLocality: string | null;
  phoneVerified: boolean;
}) {
  const [state, formAction] = useActionState(updatePublicProfileAction, initialState);
  // Live-tracked so PhoneVerificationCard can tell "typed but not saved yet"
  // (Part 15 Case 2) apart from "field is genuinely empty" (Case 1) — the
  // server action only ever sees the last-saved value, never what's
  // currently sitting in the input.
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [nameValue, setNameValue] = useState(name ?? "");
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const { setFieldComplete, scrollToNextAfter } = useProfileCompletion();
  const lastHandledSuccess = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.success || state.success === lastHandledSuccess.current) return;
    lastHandledSuccess.current = state.success;
    setFieldComplete("name", Boolean(nameValue.trim()));
    setFieldComplete("phone", Boolean(phoneValue.trim()));
    scrollToNextAfter("phone");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a new save actually completes, not on every keystroke
  }, [state.success]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField id="field-name" label="Name" name="name" value={nameValue} onChange={(e) => setNameValue(e.target.value)} placeholder="Your name" />
          <AuthField
            id="field-phone"
            ref={phoneInputRef}
            label="Phone (optional)"
            name="phone"
            type="tel"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            placeholder="+91 98765 43210"
          />
          <AuthField label="City (optional)" name="city" defaultValue={city ?? ""} placeholder="Mumbai" />
          <AuthField label="Current locality (optional)" name="currentLocality" defaultValue={currentLocality ?? ""} placeholder="Where you live now" />
        </div>
        <AuthError message={state.error} />
        <AuthSuccess message={state.success} />
        <AuthButton ref={submitButtonRef} pendingText="Saving...">
          Save
        </AuthButton>
      </form>

      <PhoneVerificationCard
        verified={phoneVerified}
        savedPhone={phone}
        currentPhoneValue={phoneValue}
        onFocusPhoneField={() => phoneInputRef.current?.focus()}
        onFocusSaveButton={() => submitButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
      />
    </div>
  );
}
