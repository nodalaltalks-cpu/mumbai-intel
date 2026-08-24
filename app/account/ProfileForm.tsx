"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updatePublicProfileAction, type ProfileFormState } from "@/lib/actions/public-profile";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";
import PhoneVerificationCard from "./PhoneVerificationCard";
import SkipFieldButton from "./SkipFieldButton";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const initialState: ProfileFormState = {};

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

const DOB_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const DOB_MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
const DOB_CURRENT_YEAR = new Date().getUTCFullYear();
const DOB_YEARS = Array.from({ length: DOB_CURRENT_YEAR - 13 - 1900 + 1 }, (_, i) => String(DOB_CURRENT_YEAR - 13 - i));

const selectClass =
  "rounded-lg border border-border bg-surface px-2.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";

export default function ProfileForm({
  name,
  phone,
  city,
  currentLocality,
  phoneVerified,
  dateOfBirth,
  gender,
}: {
  name: string | null;
  phone: string | null;
  city: string | null;
  currentLocality: string | null;
  phoneVerified: boolean;
  dateOfBirth: Date | null;
  gender: string | null;
}) {
  const [state, formAction] = useActionState(updatePublicProfileAction, initialState);
  // Live-tracked so PhoneVerificationCard can tell "typed but not saved yet"
  // (Part 15 Case 2) apart from "field is genuinely empty" (Case 1) — the
  // server action only ever sees the last-saved value, never what's
  // currently sitting in the input.
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [nameValue, setNameValue] = useState(name ?? "");
  const [dobDay, setDobDay] = useState(dateOfBirth ? String(dateOfBirth.getUTCDate()) : "");
  const [dobMonth, setDobMonth] = useState(dateOfBirth ? String(dateOfBirth.getUTCMonth() + 1) : "");
  const [dobYear, setDobYear] = useState(dateOfBirth ? String(dateOfBirth.getUTCFullYear()) : "");
  const [genderValue, setGenderValue] = useState(gender ?? "");
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const { setFieldComplete, scrollToNextAfter } = useProfileCompletion();
  const lastHandledSuccess = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.success || state.success === lastHandledSuccess.current) return;
    lastHandledSuccess.current = state.success;
    setFieldComplete("name", Boolean(nameValue.trim()));
    setFieldComplete("phone", Boolean(phoneValue.trim()));
    setFieldComplete("dateOfBirth", Boolean(dobDay && dobMonth && dobYear));
    setFieldComplete("gender", Boolean(genderValue));
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

        <div id="field-dateOfBirth" tabIndex={-1} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Date of birth (optional)</span>
          <div className="grid grid-cols-3 gap-2">
            <select name="dobDay" value={dobDay} onChange={(e) => setDobDay(e.target.value)} className={selectClass} aria-label="Day">
              <option value="">Day</option>
              {DOB_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select name="dobMonth" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} className={selectClass} aria-label="Month">
              <option value="">Month</option>
              {DOB_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select name="dobYear" value={dobYear} onChange={(e) => setDobYear(e.target.value)} className={selectClass} aria-label="Year">
              <option value="">Year</option>
              {DOB_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Helps us understand which life stage to tailor research for.</span>
            <SkipFieldButton fieldKey="dateOfBirth" />
          </div>
        </div>

        <div id="field-gender" tabIndex={-1} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Gender (optional)</span>
          <input type="hidden" name="gender" value={genderValue} />
          <div className="flex flex-wrap gap-1.5">
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGenderValue((prev) => (prev === g.value ? "" : g.value))}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  genderValue === g.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <SkipFieldButton fieldKey="gender" />
        </div>

        <p className="text-xs text-muted">Why we ask: these details help us recommend more relevant properties and research for you — never shown publicly.</p>
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
