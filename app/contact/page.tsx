import type { Metadata } from "next";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — NoDalalTalks",
  description: "Get in touch with NoDalalTalks — questions, data corrections, and partnership inquiries.",
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Contact Us</h1>
          <p className="mt-2 text-sm text-muted">
            Have a question, a correction to report, or a partnership inquiry? Send us a message and we&apos;ll get
            back to you.
          </p>
          <div className="mt-4 flex flex-col gap-1 text-sm text-muted">
            <a href="mailto:nodalaltalks02@gmail.com" className="transition-colors hover:text-accent">
              nodalaltalks02@gmail.com
            </a>
            <a href="tel:+919833750932" className="transition-colors hover:text-accent">
              +91 9833750932
            </a>
          </div>
        </div>
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
