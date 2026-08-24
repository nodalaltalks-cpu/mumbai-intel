import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { getContactEnquiryById } from "@/lib/admin-queries";
import ContactEnquiryDetail from "@/app/admin/components/ContactEnquiryDetail";

export const metadata: Metadata = { title: "Contact Enquiry — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function ContactEnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!(await hasPermission(session, "support.manage_enquiries"))) redirect("/admin");
  const { id } = await params;
  const enquiry = await getContactEnquiryById(id);
  if (!enquiry) notFound();

  return <ContactEnquiryDetail enquiry={enquiry} isAdmin={session.role === "ADMIN"} />;
}
