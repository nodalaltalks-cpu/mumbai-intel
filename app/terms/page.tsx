import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Terms of Service - NoDalalTalks",
  description: "The terms governing use of the NoDalalTalks real estate market intelligence platform.",
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" subtitle={`Last updated ${formatDate(new Date("2026-07-01"))}`}>
      <h2>1. Acceptance of terms</h2>
      <p>
        By accessing or using NoDalalTalks (the &quot;Service&quot;), you agree to be bound by these Terms of Service. If
        you do not agree, do not use the Service.
      </p>

      <h2>2. What the Service is</h2>
      <p>
        NoDalalTalks is an informational real estate market intelligence platform. It provides data and analysis on
        residential and commercial projects, builders, localities and property transactions in Mumbai. It is{" "}
        <strong>not</strong> a real estate brokerage, listing marketplace, or transaction facilitator, and it does not
        arrange, negotiate, or execute property transactions.
      </p>

      <h2>3. Accounts</h2>
      <p>
        Certain features (such as saving projects) require an account. You&apos;re responsible for maintaining the
        confidentiality of your login credentials and for all activity under your account. Notify us promptly of any
        unauthorized use.
      </p>

      <h2>4. Data accuracy</h2>
      <p>
        We tag every figure on the platform with a data source and confidence level so you can judge its reliability.
        Despite our verification efforts, data may be incomplete, delayed, or contain errors. The Service is provided
        for informational purposes and should not be the sole basis for a financial, legal, or investment decision;
        see our{" "}
        <a href="/disclaimer" className="text-accent hover:underline">
          Disclaimer
        </a>
        .
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        You agree not to: scrape or bulk-extract data from the Service using automated means without permission;
        interfere with or disrupt the Service&apos;s infrastructure; attempt to gain unauthorized access to any account
        or system; or use the Service for any unlawful purpose.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Service&apos;s design, software, and our own curated analysis, scores, and summaries are owned by
        NoDalalTalks. Underlying factual data (e.g. government transaction records) remains subject to its original
        source&apos;s terms where applicable.
      </p>

      <h2>7. Termination</h2>
      <p>We may suspend or terminate access to the Service for any account found to be in violation of these terms.</p>

      <h2>8. Disclaimer of warranties &amp; limitation of liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind, express or implied. To the maximum
        extent permitted by law, NoDalalTalks is not liable for any indirect, incidental, or consequential damages
        arising from use of the Service or reliance on its data.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the revised terms.</p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms? Reach us via the{" "}
        <a href="/contact" className="text-accent hover:underline">
          Contact
        </a>{" "}
        page.
      </p>
    </LegalPageShell>
  );
}
