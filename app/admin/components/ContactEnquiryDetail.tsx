"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  changeEnquiryStatusAction,
  addInternalNoteAction,
  recordResponseAction,
  reopenEnquiryAction,
  trashEnquiryAction,
  getEnquiryHistoryAction,
  type ContactEnquiryFormState,
} from "@/lib/actions/contact-enquiries";
import { formatDateTime } from "@/lib/format";

export interface ContactEnquiryDetailData {
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
  publicUserId: string | null;
  publicUser: { id: string; email: string; name: string | null } | null;
}

type HistoryEntry = Awaited<ReturnType<typeof getEnquiryHistoryAction>>[number];

const STATUS_CLASS: Record<string, string> = {
  NEW: "border-negative/40 bg-negative/10 text-negative",
  IN_PROGRESS: "border-accent/40 bg-accent/10 text-accent",
  WAITING_FOR_USER: "border-amber-400/40 bg-amber-400/10 text-amber-500",
  RESOLVED: "border-positive/40 bg-positive/10 text-positive",
  CLOSED: "border-border bg-muted/10 text-muted",
};

const STATUS_OPTIONS = [
  ["NEW", "New"],
  ["IN_PROGRESS", "In Progress"],
  ["WAITING_FOR_USER", "Waiting for User"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
] as const;

const ACTION_LABEL: Record<string, string> = {
  "contact_enquiry.receive": "Enquiry received",
  "contact_enquiry.status_change": "Status changed",
  "contact_enquiry.internal_note": "Internal note added",
  "contact_enquiry.response": "Response sent to user",
  "contact_enquiry.reopen": "Reopened",
};

function jsonField(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function describeEntry(entry: HistoryEntry): string | null {
  if (entry.action === "contact_enquiry.status_change") {
    const from = jsonField(entry.before, "status");
    const to = jsonField(entry.after, "status");
    if (from && to) return `${from.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}`;
    return null;
  }
  if (entry.action === "contact_enquiry.internal_note") return jsonField(entry.after, "note") ?? null;
  if (entry.action === "contact_enquiry.response") return jsonField(entry.after, "message") ?? null;
  return null;
}

const initialState: ContactEnquiryFormState = {};

export default function ContactEnquiryDetail({ enquiry, isAdmin }: { enquiry: ContactEnquiryDetailData; isAdmin: boolean }) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [reopenState, setReopenState] = useState<ContactEnquiryFormState>({});
  const [trashError, setTrashError] = useState<string | null>(null);

  function handleTrash() {
    if (!window.confirm(`Move this enquiry from ${enquiry.name} to Trash? It can be restored later from Trash.`)) return;
    setTrashError(null);
    startTransition(async () => {
      const result = await trashEnquiryAction(enquiry.id);
      if (result.error) {
        setTrashError(result.error);
        return;
      }
      router.push("/admin/contact-enquiries");
      router.refresh();
    });
  }

  const statusAction = changeEnquiryStatusAction.bind(null, enquiry.id);
  const [statusState, statusFormAction] = useActionState(statusAction, initialState);
  const noteAction = addInternalNoteAction.bind(null, enquiry.id);
  const [noteState, noteFormAction] = useActionState(noteAction, initialState);
  const responseAction = recordResponseAction.bind(null, enquiry.id);
  const [responseState, responseFormAction] = useActionState(responseAction, initialState);

  function refreshHistory() {
    getEnquiryHistoryAction(enquiry.id).then(setHistory);
  }

  useEffect(() => {
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiry.id, statusState, noteState, responseState, reopenState]);

  function handleReopen() {
    if (!window.confirm("Reopen this enquiry? Its status will move back to In Progress.")) return;
    startTransition(async () => {
      const result = await reopenEnquiryAction(enquiry.id);
      setReopenState(result);
    });
  }

  const canReopen = enquiry.status === "RESOLVED" || enquiry.status === "CLOSED";
  const internalNotes = (history ?? []).filter((h) => h.action === "contact_enquiry.internal_note");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/contact-enquiries" className="text-[10px] font-mono uppercase tracking-wide text-muted hover:text-accent">
            ← Back to Contact Enquiries
          </Link>
          <h1 className="mt-1 font-mono text-lg font-semibold text-foreground">Enquiry from {enquiry.name}</h1>
        </div>
        <span className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide ${STATUS_CLASS[enquiry.status]}`}>
          {enquiry.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* ENQUIRY */}
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">Enquiry</h2>
            {enquiry.subject ? <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">{enquiry.subject}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{enquiry.message}</p>
            <p className="mt-3 text-[10px] text-muted">
              {formatDateTime(enquiry.createdAt)}
              {enquiry.sourcePage ? ` · From ${enquiry.sourcePage}` : ""}
            </p>
          </section>

          {/* ACTIVITY */}
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">Activity</h2>
            {history === null ? (
              <p className="mt-2 text-xs text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No activity recorded yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {history.map((entry) => (
                  <div key={entry.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </span>
                      <span className="text-[11px] text-muted">
                        {entry.actor?.name ?? entry.actor?.email ?? "System"} · {formatDateTime(entry.at)}
                      </span>
                    </div>
                    {describeEntry(entry) ? <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground">{describeEntry(entry)}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* INTERNAL */}
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">Internal notes</h2>
            <p className="text-[10px] text-muted">Never visible to the user.</p>
            {internalNotes.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {internalNotes.map((n) => (
                  <div key={n.id} className="rounded-sm border border-border bg-background p-2">
                    <p className="whitespace-pre-wrap text-xs text-foreground">{describeEntry(n)}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {n.actor?.name ?? n.actor?.email ?? "System"} · {formatDateTime(n.at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">No internal notes yet.</p>
            )}
            <form action={noteFormAction} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <textarea
                name="note"
                rows={2}
                placeholder="Add an internal note (not visible to the user)"
                className="w-full resize-none rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-sm border border-border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                >
                  Add note
                </button>
                {noteState.success ? <span className="text-[10px] text-positive">{noteState.success}</span> : null}
                {noteState.error ? <span className="text-[10px] text-negative">{noteState.error}</span> : null}
              </div>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* USER */}
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">User</h2>
            <dl className="mt-2 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Name</dt>
                <dd className="text-foreground">{enquiry.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Email</dt>
                <dd className="text-foreground">{enquiry.email}</dd>
              </div>
              {enquiry.phone ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Phone</dt>
                  <dd className="text-foreground">{enquiry.phone}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Account</dt>
                <dd className="text-foreground">
                  {enquiry.publicUser ? enquiry.publicUser.name ?? enquiry.publicUser.email : "Not signed in"}
                </dd>
              </div>
            </dl>
          </section>

          {/* ACTIONS */}
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-mono text-sm font-semibold text-foreground">Actions</h2>

            <form action={statusFormAction} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <label className="text-[10px] uppercase tracking-wide text-muted">Change status</label>
              <div className="flex items-center gap-2">
                <select
                  key={enquiry.status}
                  name="status"
                  defaultValue={enquiry.status}
                  className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="shrink-0 rounded-sm border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
                >
                  Save
                </button>
              </div>
              {statusState.success ? <span className="text-[10px] text-positive">{statusState.success}</span> : null}
              {statusState.error ? <span className="text-[10px] text-negative">{statusState.error}</span> : null}
            </form>

            <form action={responseFormAction} className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
              <label className="text-[10px] uppercase tracking-wide text-muted">Send response to user</label>
              <textarea
                name="message"
                rows={3}
                placeholder="This message is delivered as an in-app notification to the user."
                className="w-full resize-none rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="self-start rounded-sm border border-border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
              >
                Send response
              </button>
              {responseState.success ? <span className="text-[10px] text-positive">{responseState.success}</span> : null}
              {responseState.error ? <span className="text-[10px] text-negative">{responseState.error}</span> : null}
            </form>

            {canReopen ? (
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={isPending}
                  className="rounded-sm border border-border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Reopen enquiry
                </button>
                {reopenState.success ? <span className="ml-2 text-[10px] text-positive">{reopenState.success}</span> : null}
                {reopenState.error ? <span className="ml-2 text-[10px] text-negative">{reopenState.error}</span> : null}
              </div>
            ) : null}

            {isAdmin ? (
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={handleTrash}
                  disabled={isPending}
                  className="rounded-sm border border-negative/40 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-negative hover:bg-negative/10 disabled:opacity-50"
                >
                  Move to Trash
                </button>
                {trashError ? <span className="ml-2 text-[10px] text-negative">{trashError}</span> : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
