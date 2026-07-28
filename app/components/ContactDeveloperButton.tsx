"use client";

import { useActionState, useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import AuthField from "@/app/components/auth/AuthField";
import AuthButton from "@/app/components/auth/AuthButton";
import { AuthError, AuthSuccess } from "@/app/components/auth/AuthMessage";
import { submitProjectInquiryAction, type ProjectInquiryFormState } from "@/lib/actions/project-inquiry";

const initialState: ProjectInquiryFormState = {};

export default function ContactDeveloperButton({
  projectName,
  defaultName,
  defaultEmail,
}: {
  projectName: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(submitProjectInquiryAction, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Contact Developer
      </button>

      {open ? (
        <Dialog title={`Contact developer — ${projectName}`} onClose={() => setOpen(false)}>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="projectName" value={projectName} />
            <input type="hidden" name="projectUrl" value={typeof window !== "undefined" ? window.location.href : ""} />
            <p className="text-xs text-muted">
              This goes to Mumbai Intel, who&apos;ll connect you with the developer team for {projectName}.
            </p>
            <AuthField label="Name" name="name" type="text" required maxLength={120} defaultValue={defaultName ?? ""} />
            <AuthField label="Email" name="email" type="email" required defaultValue={defaultEmail ?? ""} />
            <AuthField label="Phone (optional)" name="phone" type="tel" maxLength={20} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Message</span>
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                placeholder={`I'm interested in ${projectName} — please share more details.`}
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-shadow focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
              />
            </label>
            <AuthError message={state.error} />
            <AuthSuccess message={state.success} />
            <AuthButton pendingText="Sending...">Send inquiry</AuthButton>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
