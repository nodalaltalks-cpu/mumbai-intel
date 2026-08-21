"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { submitContactMessageAction, CONTACT_SUBJECTS, type ContactFormState } from "@/lib/actions/contact";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";

const initialState: ContactFormState = {};

export default function ContactForm() {
  const [state, formAction] = useActionState(submitContactMessageAction, initialState);
  const pathname = usePathname();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="sourcePage" value={pathname} />
      <AuthField label="Name" name="name" type="text" placeholder="Your name" required maxLength={120} />
      <AuthField label="Email" name="email" type="email" placeholder="you@example.com" required />
      <AuthField label="Phone (optional)" name="phone" type="tel" placeholder="+91 98765 43210" />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">What&apos;s this about? (optional)</span>
        <select
          name="subject"
          defaultValue=""
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-shadow focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        >
          <option value="">Choose one</option>
          {CONTACT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Message</span>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder="What's your question, correction, or partnership inquiry?"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-shadow focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        />
      </label>

      <AuthError message={state.error} />
      <AuthSuccess message={state.success} />

      <AuthButton pendingText="Sending...">Send message</AuthButton>
    </form>
  );
}
