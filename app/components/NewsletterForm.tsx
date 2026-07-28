"use client";

import { useActionState } from "react";
import { subscribeNewsletterAction, type NewsletterFormState } from "@/lib/actions/newsletter";

const initialState: NewsletterFormState = {};

export default function NewsletterForm() {
  const [state, formAction, isPending] = useActionState(subscribeNewsletterAction, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="footer-newsletter-email">
          Email address
        </label>
        <input
          id="footer-newsletter-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-sm bg-accent px-3 py-2 text-[11px] font-mono font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-dim disabled:opacity-60"
        >
          {isPending ? "…" : "Subscribe"}
        </button>
      </div>
      {state.error ? <p className="text-[11px] text-negative">{state.error}</p> : null}
      {state.success ? <p className="text-[11px] text-positive">{state.success}</p> : null}
    </form>
  );
}
