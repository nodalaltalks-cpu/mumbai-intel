"use client";

import { useState, useTransition } from "react";
import { requestPhoneVerificationAction } from "@/lib/actions/phone-verification";
import Button from "@/app/components/ui/Button";

/**
 * Four explicit cases, checked client-side first (server action re-checks
 * everything too — this is UX, not the security boundary):
 * 1. Field empty -> red error, focus the phone field.
 * 2. Typed but not yet saved (differs from the last-saved `savedPhone` prop)
 *    -> tell them to save first, scroll to the Save button.
 * 3. Saved and unverified -> call the real request-verification action.
 * 4. Already verified -> static confirmation, never re-request.
 */
export default function PhoneVerificationCard({
  verified,
  savedPhone,
  currentPhoneValue,
  onFocusPhoneField,
  onFocusSaveButton,
}: {
  verified: boolean;
  savedPhone: string | null;
  currentPhoneValue: string;
  onFocusPhoneField: () => void;
  onFocusSaveButton: () => void;
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
      setMessage({ tone: "info", text: "Please save your phone number before requesting verification." });
      onFocusSaveButton();
      return;
    }
    startTransition(async () => {
      const result = await requestPhoneVerificationAction();
      if (result.error) setMessage({ tone: "error", text: result.error });
      else setMessage({ tone: "success", text: result.success ?? "Request sent." });
    });
  }

  return (
    <div className="mt-3 rounded-sm border border-border bg-background p-3">
      <p className="text-xs text-foreground">Want faster updates on new launches, offers and availability?</p>
      <p className="mt-1 text-[11px] text-muted">
        You can optionally verify your phone number to receive relevant updates from us. Your number is optional and will not be required to
        research properties. We&apos;ll never share it with brokers or developers.
      </p>
      <div className="mt-2">
        {message ? (
          <p className={`mb-2 text-[11px] ${message.tone === "error" ? "text-negative" : message.tone === "success" ? "text-positive" : "text-accent"}`}>
            {message.text}
          </p>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={isPending}>
          {isPending ? "Requesting..." : "Request verification"}
        </Button>
      </div>
    </div>
  );
}
