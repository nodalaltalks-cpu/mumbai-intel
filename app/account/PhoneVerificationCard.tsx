"use client";

import { useState, useTransition } from "react";
import { requestPhoneVerificationAction } from "@/lib/actions/phone-verification";
import Button from "@/app/components/ui/Button";

/**
 * Three explicit cases, checked client-side first (server action re-checks
 * everything too — this is UX, not the security boundary):
 * 1. Field empty -> red error, focus the phone field.
 * 2. Typed but the auto-save for it hasn't landed yet (differs from the
 *    last-saved `savedPhone` prop, which the phone field's own debounce/blur
 *    auto-save updates within under a second) -> ask them to wait a moment,
 *    refocus the phone field. There's no "Save" button anymore (Section 9) —
 *    this closes almost immediately since the field auto-saves on blur.
 * 3. Saved and unverified -> call the real request-verification action.
 * 4. Already verified -> static confirmation, never re-request.
 */
export default function PhoneVerificationCard({
  verified,
  savedPhone,
  currentPhoneValue,
  onFocusPhoneField,
}: {
  verified: boolean;
  savedPhone: string | null;
  currentPhoneValue: string;
  onFocusPhoneField: () => void;
}) {
  const [message, setMessage] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (verified) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-positive">
        <span aria-hidden="true">✓</span> Phone verified
      </p>
    );
  }

  function handleClick() {
    const trimmed = currentPhoneValue.trim();
    if (!trimmed) {
      setMessage({ tone: "error", text: "Please enter your phone number above before requesting verification." });
      onFocusPhoneField();
      return;
    }
    if (trimmed !== (savedPhone ?? "").trim()) {
      setMessage({ tone: "info", text: "Give it just a moment — we're still saving your number." });
      onFocusPhoneField();
      return;
    }
    startTransition(async () => {
      const result = await requestPhoneVerificationAction();
      if (result.error) setMessage({ tone: "error", text: result.error });
      else setMessage({ tone: "success", text: result.success ?? "Request sent." });
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {message ? (
        <p className={`text-[11px] ${message.tone === "error" ? "text-negative" : message.tone === "success" ? "text-positive" : "text-accent"}`}>
          {message.text}
        </p>
      ) : null}
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={handleClick} disabled={isPending}>
        {isPending ? "Requesting..." : "Verify phone number"}
      </Button>
    </div>
  );
}
