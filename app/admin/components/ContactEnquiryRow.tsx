"use client";

import { useActionState, useState } from "react";
import { updateContactEnquiryAction, type ContactEnquiryFormState } from "@/lib/actions/contact-enquiries";
import { formatDateTime } from "@/lib/format";

export interface ContactEnquiryData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  sourcePage: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  publicUser: { id: string; email: string; name: string | null } | null;
}

const STATUS_CLASS: Record<string, string> = {
  NEW: "border-negative/40 bg-negative/10 text-negative",
  IN_PROGRESS: "border-accent/40 bg-accent/10 text-accent",
  RESOLVED: "border-positive/40 bg-positive/10 text-positive",
};

const initialState: ContactEnquiryFormState = {};

export default function ContactEnquiryRow({ enquiry }: { enquiry: ContactEnquiryData }) {
  const action = updateContactEnquiryAction.bind(null, enquiry.id);
  const [state, formAction] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[enquiry.status]}`}>
              {enquiry.status.replace("_", " ")}
            </span>
            {enquiry.subject ? <span className="text-[10px] uppercase tracking-wide text-muted">{enquiry.subject}</span> : null}
            <span className="text-[10px] text-muted">{formatDateTime(enquiry.createdAt)}</span>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {enquiry.name} · <span className="font-normal text-muted">{enquiry.email}</span>
          </p>
          {enquiry.phone ? <p className="text-[11px] text-muted">{enquiry.phone}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">{enquiry.message}</p>
          <p className="mt-1.5 text-[10px] text-muted">
            {enquiry.publicUser ? `Signed-in user: ${enquiry.publicUser.name ?? enquiry.publicUser.email}` : "Not signed in"}
            {enquiry.sourcePage ? ` · From ${enquiry.sourcePage}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open ? (
        <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="status"
              defaultValue={enquiry.status}
              className="rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
            </select>
            <button
              type="submit"
              className="rounded-sm border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
            >
              Save
            </button>
            {state.success ? <span className="text-[10px] text-positive">{state.success}</span> : null}
            {state.error ? <span className="text-[10px] text-negative">{state.error}</span> : null}
          </div>
          <textarea
            name="adminNotes"
            defaultValue={enquiry.adminNotes ?? ""}
            rows={2}
            placeholder="Internal notes (not visible to the user)"
            className="w-full resize-none rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </form>
      ) : null}
    </div>
  );
}
