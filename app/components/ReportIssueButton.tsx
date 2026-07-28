"use client";

import { useActionState, useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";
import { submitReportIssueAction, type ReportIssueFormState } from "@/lib/actions/report-issue";

const initialState: ReportIssueFormState = {};

/** Generic "Report Incorrect Information" trigger — works for Project/Builder/Locality pages alike, signed-in or anonymous. */
export default function ReportIssueButton({
  entityType,
  entityName,
  loggedIn,
}: {
  entityType: string;
  entityName: string;
  loggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(submitReportIssueAction, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-mono uppercase tracking-wide text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-accent"
      >
        Report incorrect information
      </button>

      {open ? (
        <Dialog title={`Report an issue — ${entityName}`} onClose={() => setOpen(false)}>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityName" value={entityName} />
            <input type="hidden" name="entityUrl" value={typeof window !== "undefined" ? window.location.href : ""} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">What&apos;s incorrect?</span>
              <textarea
                name="issue"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                placeholder="e.g. the price band is outdated, wrong RERA number, incorrect possession date…"
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-shadow focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
              />
            </label>
            {!loggedIn ? <AuthField label="Your email (optional)" name="email" type="email" placeholder="you@example.com" /> : null}
            <AuthError message={state.error} />
            <AuthSuccess message={state.success} />
            <AuthButton pendingText="Sending...">Send report</AuthButton>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
