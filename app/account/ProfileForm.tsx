"use client";

import { useEffect, useRef, useState } from "react";
import { updatePublicProfileAction } from "@/lib/actions/public-profile";
import AuthField from "@/app/components/auth/AuthField";
import { AuthError } from "@/app/components/auth/AuthMessage";
import PhoneVerificationCard from "./PhoneVerificationCard";
import CountryCodeSelect from "@/app/components/CountryCodeSelect";
import { DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
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

/**
 * "Saved" must never be shown next to a field that's currently empty — an
 * empty field with a checkmark reads as "there's a saved value here" when
 * there isn't one, whether that's because nothing was ever entered, or
 * because the user just cleared a previously-saved value (the persisted
 * state after that clear genuinely IS "saved", it's just saved-as-empty,
 * which isn't a state worth celebrating with a checkmark). "saving" and
 * "error" still surface regardless of emptiness -- both are actionable
 * feedback about a real in-flight/failed request, not a claim about content.
 */
function effectiveSaveState(value: string, state: SaveState): SaveState {
  if (state === "saved" && value.trim() === "") return "idle";
  return state;
}

export default function ProfileForm({
  name,
  phone,
  phoneCountryCode,
  city,
  currentLocality,
  phoneVerified,
  dateOfBirth,
  gender,
}: {
  name: string | null;
  phone: string | null;
  phoneCountryCode: string;
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
  const [phoneCountryCodeValue, setPhoneCountryCodeValue] = useState(phoneCountryCode || DEFAULT_COUNTRY_CODE);
  const [cityValue, setCityValue] = useState(city ?? "");
  const [localityValue, setLocalityValue] = useState(currentLocality ?? "");
  const [dobDay, setDobDay] = useState(dateOfBirth ? String(dateOfBirth.getUTCDate()) : "");
  const [dobMonth, setDobMonth] = useState(dateOfBirth ? String(dateOfBirth.getUTCMonth() + 1) : "");
  const [dobYear, setDobYear] = useState(dateOfBirth ? String(dateOfBirth.getUTCFullYear()) : "");
  const [genderValue, setGenderValue] = useState(gender ?? "");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // Shown directly below the phone field instead of the generic bottom
  // AuthError box -- a duplicate-phone collision is specific to this field,
  // so the message belongs right where the user is looking, not at the
  // bottom of an unrelated section. Cleared the instant the user edits the
  // number again (handlePhoneChange), not just on the next successful save.
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  // The value currently being sent to the server for a given fieldKey (set the
  // instant a request starts, cleared once it settles) — lets a second trigger
  // for the SAME field (e.g. phone's debounce firing, then blur firing a
  // fraction later) recognize "this exact value is already in flight" instead
  // of firing a redundant duplicate request. See handlePhoneChange/onBlur.
  const inFlightValueRef = useRef<Record<string, string | undefined>>({});
  // Per-field request sequence — every persist() call for a fieldKey gets the
  // next number, and only the response matching the CURRENT (latest) number
  // is allowed to update saveStates/formError. Without this, two requests for
  // the same field (the debounce-fired save and a blur-fired duplicate racing
  // it, or simply two edits in quick succession) can resolve out of order,
  // and a stale/duplicate response arriving after a newer one already
  // succeeded can clobber a correct "saved" state back to a spurious "error"
  // -- this was the actual root cause of phone autosave intermittently
  // showing "Couldn't save" for a genuinely valid, already-persisted number.
  const requestSeqRef = useRef<Record<string, number>>({});

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
    onSuccess?: () => void,
    /** When provided, routes this field's error (or its clearing, on success) here instead of the shared bottom formError -- used by phone/phoneCountryCode so a duplicate-number collision shows directly below the phone field. */
    setFieldError?: (message: string | undefined) => void
  ) {
    const wasComplete = isFieldComplete(completionKey);
    const seq = (requestSeqRef.current[fieldKey] ?? 0) + 1;
    requestSeqRef.current[fieldKey] = seq;
    const isCurrent = () => requestSeqRef.current[fieldKey] === seq;
    setSaveStates((prev) => ({ ...prev, [fieldKey]: "saving" }));
    const fd = new FormData();
    build(fd);
    const result = await updatePublicProfileAction({}, fd);
    if (!isCurrent()) return; // a newer request for this field has since superseded this one -- this response is stale, ignore it
    if (result.error) {
      setSaveStates((prev) => ({ ...prev, [fieldKey]: "error" }));
      if (setFieldError) setFieldError(result.error);
      else setFormError(result.error);
      return;
    }
    if (setFieldError) setFieldError(undefined);
    else setFormError(undefined);
    setFieldComplete(completionKey, isNowComplete);
    setSaveStates((prev) => ({ ...prev, [fieldKey]: "saved" }));
    onSuccess?.();
    if (!wasComplete && isNowComplete) scrollToNextAfter(completionKey);
  }

  /** Debounced text-field auto-save — fires ~1200ms after typing stops rather than on every keystroke, so the user gets TYPE -> PAUSE -> AUTO-SAVE instead of a save per keystroke. Restarts on every change (existing timer cleared first), never stacking duplicate saves. */
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
    }, 1200);
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

  /** The single place a phone save actually fires (debounce timeout or blur-flush both funnel through this) — marks inFlightValueRef the instant the request starts, so the OTHER trigger can recognize this exact value is already being saved and skip a redundant duplicate. */
  function firePhoneSave(value: string) {
    inFlightValueRef.current.phone = value;
    void persist("phone", (fd) => fd.set("phone", value), "phone", Boolean(value.trim()), () => setSavedPhone(value), setPhoneError).finally(() => {
      if (inFlightValueRef.current.phone === value) inFlightValueRef.current.phone = undefined;
    });
  }

  function handlePhoneChange(value: string) {
    setPhoneValue(value);
    setPhoneError(undefined); // clear any stale duplicate-number error the instant the user edits the number again
    const existing = debounceRefs.current.phone;
    if (existing) clearTimeout(existing);
    debounceRefs.current.phone = setTimeout(() => firePhoneSave(value), 1200);
  }

  /** A discrete selection, not typed text — saves immediately, no debounce. Completion never changes here: the phone SECTION is scored on the local number alone (PROFILE_COMPLETION_SECTIONS' "phone" predicate), so this always passes the field's current completion state through unchanged. Routed through setPhoneError too -- the (countryCode, phone) pair is what's actually unique, so changing just the country code can equally collide with another account. */
  function handleCountryCodeChange(dialCode: string) {
    setPhoneCountryCodeValue(dialCode);
    void persist("phoneCountryCode", (fd) => fd.set("phoneCountryCode", dialCode), "phone", Boolean(phoneValue.trim()), undefined, setPhoneError);
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
            <SaveStatus state={effectiveSaveState(nameValue, saveStates.name ?? "idle")} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Phone (optional)</span>
            <div className="flex gap-1.5">
              <CountryCodeSelect value={phoneCountryCodeValue} onChange={handleCountryCodeChange} />
              <input
                id="field-phone"
                ref={phoneInputRef}
                name="phone"
                type="tel"
                value={phoneValue}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={() => {
                  // Flush immediately on blur rather than waiting out the debounce, so
                  // "typed but not saved" (PhoneVerificationCard's Case 2) closes as
                  // soon as the user leaves the field, not up to 1200ms later.
                  const existing = debounceRefs.current.phone;
                  if (existing) clearTimeout(existing);
                  const trimmed = phoneValue.trim();
                  if (trimmed === savedPhone.trim()) return; // already persisted
                  // The debounce timer may have already fired (or another blur already
                  // fired) for this exact value a moment ago and is still in flight --
                  // firing a second identical request here would race it and risk a
                  // later-arriving duplicate's failure clobbering the first one's
                  // success in the UI (the actual root cause of the phone "Couldn't
                  // save" bug). Skip; that in-flight request will settle savedPhone.
                  if (inFlightValueRef.current.phone?.trim() === trimmed) return;
                  firePhoneSave(phoneValue);
                }}
                placeholder="98765 43210"
                aria-invalid={phoneError ? true : undefined}
                className={`w-full min-w-0 rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-shadow focus:outline-none focus:ring-4 ${
                  phoneError ? "border-negative focus:border-negative focus:ring-negative/10" : "border-border focus:border-accent focus:ring-accent/10"
                }`}
              />
            </div>
            {phoneError ? (
              <p className="text-[11px] text-negative">{phoneError}</p>
            ) : (
              <SaveStatus state={effectiveSaveState(phoneValue, saveStates.phone ?? "idle")} />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <AuthField label="City (optional)" name="city" value={cityValue} onChange={(e) => handleCityChange(e.target.value)} placeholder="Mumbai" />
            <SaveStatus state={effectiveSaveState(cityValue, saveStates.city ?? "idle")} />
          </div>
          <div className="flex flex-col gap-1">
            <AuthField
              label="Current locality (optional)"
              name="currentLocality"
              value={localityValue}
              onChange={(e) => handleLocalityChange(e.target.value)}
              placeholder="Where you live now"
            />
            <SaveStatus state={effectiveSaveState(localityValue, saveStates.currentLocality ?? "idle")} />
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
            <SaveStatus state={effectiveSaveState(genderValue, saveStates.gender ?? "idle")} />
          </div>
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
