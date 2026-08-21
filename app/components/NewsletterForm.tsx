"use client";

import { useActionState, useId } from "react";
import { subscribeNewsletterAction, type NewsletterFormState } from "@/lib/actions/newsletter";

const initialState: NewsletterFormState = {};

/**
 * `source` tags which surface drove the subscription (see
 * NewsletterSubscriber.source in prisma/schema.prisma) so admin can see
 * which parts of the site generate subscribers — defaults to "footer" since
 * that's this form's original and most common placement.
 */
export default function NewsletterForm({ source = "footer" }: { source?: string }) {
  const [state, formAction, isPending] = useActionState(subscribeNewsletterAction, initialState);
  const inputId = useId();

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={inputId}>
          Email address
        </label>
        <input
          id={inputId}
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
          {isPending ? "…" : "Subscribe Free"}
        </button>
      </div>
      {/* min-h reserves the message row's height so the success/error line never shifts surrounding layout when it appears. */}
      <div className="min-h-[1.25rem]">
        {state.error ? <p className="text-[11px] text-negative">{state.error}</p> : null}
        {state.success ? (
          <p className="flex items-center gap-1 text-[11px] text-positive">
            <span aria-hidden="true">✓</span>
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
