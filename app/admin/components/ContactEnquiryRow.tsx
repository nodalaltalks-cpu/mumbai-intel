import Link from "next/link";
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
  WAITING_FOR_USER: "border-amber-400/40 bg-amber-400/10 text-amber-500",
  RESOLVED: "border-positive/40 bg-positive/10 text-positive",
  CLOSED: "border-border bg-muted/10 text-muted",
};

export default function ContactEnquiryRow({ enquiry }: { enquiry: ContactEnquiryData }) {
  return (
    <Link
      href={`/admin/contact-enquiries/${enquiry.id}`}
      className="block rounded-sm border border-border bg-surface p-4 hover:border-accent/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[enquiry.status]}`}>
              {enquiry.status.replace(/_/g, " ")}
            </span>
            {enquiry.subject ? <span className="text-[10px] uppercase tracking-wide text-muted">{enquiry.subject}</span> : null}
            <span className="text-[10px] text-muted">{formatDateTime(enquiry.createdAt)}</span>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {enquiry.name} · <span className="font-normal text-muted">{enquiry.email}</span>
          </p>
          {enquiry.phone ? <p className="text-[11px] text-muted">{enquiry.phone}</p> : null}
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-foreground">{enquiry.message}</p>
          <p className="mt-1.5 text-[10px] text-muted">
            {enquiry.publicUser ? `Signed-in user: ${enquiry.publicUser.name ?? enquiry.publicUser.email}` : "Not signed in"}
            {enquiry.sourcePage ? ` · From ${enquiry.sourcePage}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted">
          Open →
        </span>
      </div>
    </Link>
  );
}
