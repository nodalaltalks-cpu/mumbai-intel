import type { Metadata } from "next";
import { getContactEnquiries } from "@/lib/admin-queries";
import ContactEnquiryRow from "@/app/admin/components/ContactEnquiryRow";

export const metadata: Metadata = { title: "Contact Enquiries — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: undefined, label: "All" },
  { key: "NEW", label: "New" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

export default async function ContactEnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status === "NEW" || sp.status === "IN_PROGRESS" || sp.status === "RESOLVED" ? sp.status : undefined;
  const enquiries = await getContactEnquiries(status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Contact Enquiries</h1>
        <p className="text-xs text-muted">Every message submitted through /contact, linked to the account when the sender was signed in.</p>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <a
            key={t.label}
            href={t.key ? `/admin/contact-enquiries?status=${t.key}` : "/admin/contact-enquiries"}
            className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${
              status === t.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {enquiries.length === 0 ? (
        <p className="text-xs text-muted">No enquiries yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {enquiries.map((enquiry) => (
            <ContactEnquiryRow key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}
    </div>
  );
}
