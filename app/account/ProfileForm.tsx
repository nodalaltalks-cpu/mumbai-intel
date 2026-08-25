"use client";

import { useEffect, useRef, useState } from "react";
import { updatePublicProfileAction } from "@/lib/actions/public-profile";
import AuthField from "@/app/components/auth/AuthField";
import { AuthError } from "@/app/components/auth/AuthMessage";
import PhoneVerificationCard from "./PhoneVerificationCard";
import SkipFieldButton from "./SkipFieldButton";
import { useProfileCompletion } from "@/lib/profile-completion-client";

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

type SaveState = "idle" | "saving" | "saved" | "error";

/** Tiny inline status, reused for every auto-saved field on this card — Section 9's "show a subtle saving state, then a saved state" without a dedicated Save button anywhere. */
function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="text-[10px] text-muted">Saving…</span>;
  if (state === "saved") return <span className="text-[10px] text-positive">✓ Saved</span>;
  if (state === "error") return <span className="text-[10px] text-negative">Couldn&apos;t save — try again</span>;
  return null;
}

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
  const [nameValue, setNameValue] = useState(name ?? "");
  // Live-tracked so PhoneVerificationCard can tell "typed but not saved yet"
  // apart from "field is genuinely empty" — auto-save narrows this window to
  // a debounce interval, but the check still matters if verification is
  // requested mid-debounce.
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [savedPhone, setSavedPhone] = useState(phone ?? "");
  const [cityValue, setCityValue] = useState(city ?? "");
  const [localityValue, setLocalityValue] = useState(currentLocality ?? "");
  const [dobDay, setDobDay] = useState(dateOfBirth ? String(dateOfBirth.getUTCDate()) : "");
  const [dobMonth, setDobMonth] = useState(dateOfBirth ? String(dateOfBirth.getUTCMonth() + 1) : "");
  const [dobYear, setDobYear] = useState(dateOfBirth ? String(dateOfBirth.getUTCFullYear()) : "");
  const [genderValue, setGenderValue] = useState(gender ?? "");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  /**
   * The one save primitive every field below calls into — a per-field
   * FormData with ONLY that field's key(s) present, so the field-presence
   * gate in updatePublicProfileAction never touches any other field
   * (Section 8/10's actual fix: no field can overwrite another). Auto-advance
   * only fires on a genuine incomplete -> complete transition (Section 12/18),
   * never on every re-save of an already-complete field.
   */
  async function persist(
    fieldKey: string,
    build: (fd: FormData) => void,
    completionKey: string,
    isNowComplete: boolean,
    onSuccess?: () => void
  ) {
    const wasComplete = isFieldComplete(completionKey);
    setSaveStates((prev) => ({ ...prev, [fieldKey]: "saving" }));
    const fd = new FormData();
    build(fd);
    const result = await updatePublicProfileAction({}, fd);
    if (result.error) {
      setSaveStates((prev) => ({ ...prev, [fieldKey]: "error" }));
      setFormError(result.error);
      return;
    }
    setFormError(undefined);
    setFieldComplete(completionKey, isNowComplete);
    setSaveStates((prev) => ({ ...prev, [fieldKey]: "saved" }));
    onSuccess?.();
    if (!wasComplete && isNowComplete) scrollToNextAfter(completionKey);
  }

  /** Debounced text-field auto-save — fires ~700ms after typing stops rather than on every keystroke (Section 9's "sensible debouncing", avoids one DB write per character). */
  function debouncedPersist(
    fieldKey: string,
    build: (fd: FormData) => void,
    completionKey: string,
    isNowComplete: boolean,
    onSuccess?: () => void
  ) {
    const existing = debounceRefs.current[fieldKey];
    if (existing) clearTimeout(existing);
    debounceRefs.current[fieldKey] = setTimeout(() => {
      void persist(fieldKey, build, completionKey, isNowComplete, onSuccess);
    }, 700);
  }

  useEffect(() => {
    const refs = debounceRefs.current;
    return () => {
      Object.values(refs).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  function handleNameChange(value: string) {
    setNameValue(value);
    debouncedPersist("name", (fd) => fd.set("name", value), "name", Boolean(value.trim()));
  }

  function handlePhoneChange(value: string) {
    setPhoneValue(value);
    debouncedPersist("phone", (fd) => fd.set("phone", value), "phone", Boolean(value.trim()), () => setSavedPhone(value));
  }

  function handleCityChange(value: string) {
    setCityValue(value);
    debouncedPersist("city", (fd) => fd.set("city", value), "city", true); // city/locality aren't scored fields -- always "complete" once touched, just persisted
  }

  function handleLocalityChange(value: string) {
    setLocalityValue(value);
    debouncedPersist("currentLocality", (fd) => fd.set("currentLocality", value), "currentLocality", true);
  }

  // Track the last DOB combination actually persisted, so selecting Day then
  // Month then Year doesn't fire three redundant saves once all three are set.
  const lastSavedDobRef = useRef(`${dobDay}-${dobMonth}-${dobYear}`);
  function commitDob(day: string, month: string, year: string) {
    const key = `${day}-${month}-${year}`;
    if (key === lastSavedDobRef.current) return;
    if (!day || !month || !year) return; // partial selection -- wait for all three, same as the original combined-form validation
    lastSavedDobRef.current = key;
    void persist(
      "dob",
      (fd) => {
        fd.set("dobSubmitted", "1");
        fd.set("dobDay", day);
        fd.set("dobMonth", month);
        fd.set("dobYear", year);
      },
      "dateOfBirth",
      true
    );
  }

  function handleGenderClick(value: string) {
    const next = genderValue === value ? "" : value;
    setGenderValue(next);
    void persist("gender", (fd) => fd.set("gender", next), "gender", Boolean(next));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <AuthField id="field-name" label="Name" name="name" value={nameValue} onChange={(e) => handleNameChange(e.target.value)} placeholder="Your name" />
            <SaveStatus state={saveStates.name ?? "idle"} />
          </div>
          <div className="flex flex-col gap-1">
            <AuthField
              id="field-phone"
              ref={phoneInputRef}
              label="Phone (optional)"
              name="phone"
              type="tel"
              value={phoneValue}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => {
                // Flush immediately on blur rather than waiting out the debounce, so
                // "typed but not saved" (PhoneVerificationCard's Case 2) closes as
                // soon as the user leaves the field, not up to 700ms later.
                const existing = debounceRefs.current.phone;
                if (existing) clearTimeout(existing);
                if (phoneValue.trim() !== savedPhone.trim()) {
                  const value = phoneValue;
                  void persist("phone", (fd) => fd.set("phone", value), "phone", Boolean(value.trim()), () => setSavedPhone(value));
                }
              }}
              placeholder="+91 98765 43210"
            />
            <SaveStatus state={saveStates.phone ?? "idle"} />
          </div>
          <div className="flex flex-col gap-1">
            <AuthField label="City (optional)" name="city" value={cityValue} onChange={(e) => handleCityChange(e.target.value)} placeholder="Mumbai" />
            <SaveStatus state={saveStates.city ?? "idle"} />
          </div>
          <div className="flex flex-col gap-1">
            <AuthField
              label="Current locality (optional)"
              name="currentLocality"
              value={localityValue}
              onChange={(e) => handleLocalityChange(e.target.value)}
              placeholder="Where you live now"
            />
            <SaveStatus state={saveStates.currentLocality ?? "idle"} />
          </div>
        </div>

        <div id="field-dateOfBirth" tabIndex={-1} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Date of birth (optional)</span>
          <div className="grid grid-cols-3 gap-2">
            <select
              name="dobDay"
              value={dobDay}
              onChange={(e) => {
                setDobDay(e.target.value);
                commitDob(e.target.value, dobMonth, dobYear);
              }}
              className={selectClass}
              aria-label="Day"
            >
              <option value="">Day</option>
              {DOB_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              name="dobMonth"
              value={dobMonth}
              onChange={(e) => {
                setDobMonth(e.target.value);
                commitDob(dobDay, e.target.value, dobYear);
              }}
              className={selectClass}
              aria-label="Month"
            >
              <option value="">Month</option>
              {DOB_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              name="dobYear"
              value={dobYear}
              onChange={(e) => {
                setDobYear(e.target.value);
                commitDob(dobDay, dobMonth, e.target.value);
              }}
              className={selectClass}
              aria-label="Year"
            >
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
            <div className="flex items-center gap-2">
              <SaveStatus state={saveStates.dob ?? "idle"} />
              <SkipFieldButton fieldKey="dateOfBirth" />
            </div>
          </div>
        </div>

        <div id="field-gender" tabIndex={-1} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Gender (optional)</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => handleGenderClick(g.value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  genderValue === g.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
                }`}
              >
                {g.label}
              </button>
            ))}
            <SaveStatus state={saveStates.gender ?? "idle"} />
          </div>
          <SkipFieldButton fieldKey="gender" />
        </div>

        <p className="text-xs text-muted">Why we ask: these details help us recommend more relevant properties and research for you — never shown publicly.</p>
        <AuthError message={formError} />
      </div>

      <PhoneVerificationCard
        verified={phoneVerified}
        savedPhone={savedPhone}
        currentPhoneValue={phoneValue}
        onFocusPhoneField={() => {
          phoneInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          phoneInputRef.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}
