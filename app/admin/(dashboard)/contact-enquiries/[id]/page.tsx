import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guard";
import { getContactEnquiryById } from "@/lib/admin-queries";
import ContactEnquiryDetail from "@/app/admin/components/ContactEnquiryDetail";

export const metadata: Metadata = { title: "Contact Enquiry — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function ContactEnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const enquiry = await getContactEnquiryById(id);
  if (!enquiry) notFound();

  return <ContactEnquiryDetail enquiry={enquiry} isAdmin={session.role === "ADMIN"} />;
}
