import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";

export const metadata: Metadata = {
  title: "FAQ — NoDalalTalks",
  description: "Answers to common questions about NoDalalTalks's data sources, accounts, and how to use the platform.",
};

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is NoDalalTalks?",
    answer:
      "A real estate market intelligence platform for Mumbai — project, builder and locality profiles, a registered-transaction database, and market analytics — where every figure is tagged with where it came from.",
  },
  {
    question: "What do the data-source tags mean?",
    answer:
      "Every fact carries one of five sources: Govt Verified (official records), Builder Data (developer-supplied), Analyst Verified (checked by our team), Estimated (calculated from available data), or Community (shared by users). A confidence level (High/Medium/Low) is attached alongside it.",
  },
  {
    question: "Where does the transaction data come from?",
    answer:
      "Today, transaction records are curated manually by our analysts from available public records and deal information. We're continuously working to expand and verify this data over time.",
  },
  {
    question: "Is NoDalalTalks a brokerage or does it facilitate transactions?",
    answer:
      "No. NoDalalTalks is an information and analytics platform only. We don't list properties for sale, broker deals, or take commissions. See our Disclaimer for details.",
  },
  {
    question: "Do I need an account to browse the site?",
    answer:
      "No — projects, builders, localities, transactions, market data, insights and the map are all browsable without signing in. An account lets you save projects and access your profile.",
  },
  {
    question: "How do I save a project?",
    answer:
      "Sign in, then use the Save button on any project's detail page. Saved projects appear on your Account page.",
  },
  {
    question: "How current is the data?",
    answer:
      "Update frequency varies by data type and is being actively expanded. Check the data-source tag and confidence level on any figure for context on how it was derived and how recently it was verified.",
  },
  {
    question: "I found an error in the data — how do I report it?",
    answer: "Please reach out via the Contact page with the project/locality/transaction in question and what looks wrong.",
  },
];

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">Frequently Asked Questions</h1>
          <p className="mt-2 text-sm text-muted">
            Can&apos;t find what you&apos;re looking for?{" "}
            <Link href="/contact" className="text-accent hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {FAQS.map((faq) => (
            <details key={faq.question} className="rounded-sm border border-border bg-surface p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">{faq.question}</summary>
              <p className="mt-2 text-xs leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
