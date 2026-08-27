import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Terms of Service - NoDalalTalks",
  description: "The terms governing use of the NoDalalTalks real estate market intelligence platform.",
};

const EFFECTIVE_DATE = new Date("2026-07-01");
const LAST_UPDATED = new Date("2026-08-27");

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle={`Effective ${formatDate(EFFECTIVE_DATE)} · Last updated ${formatDate(LAST_UPDATED)}`}
    >
      <h2>1. Acceptance of terms</h2>
      <p>
        By accessing or using NoDalalTalks (the &quot;Service&quot;), you agree to be bound by these Terms. If you do
        not agree, do not use the Service.
      </p>

      <h2>2. What the Service is</h2>
      <p>
        NoDalalTalks is an informational real estate research and market-intelligence platform covering residential
        and commercial projects, builders, localities, and property transactions. It is <strong>not</strong> a real
        estate brokerage, listing marketplace, or transaction facilitator, and does not arrange, negotiate, or
        execute property transactions.
      </p>

      <h2>3. Eligibility</h2>
      <p>You must be at least 18 years old, and able to form a binding contract in your jurisdiction, to create an account.</p>

      <h2>4. Accounts</h2>
      <p>
        You&apos;re responsible for the accuracy of the information you provide, for keeping your login credentials
        confidential, and for all activity under your account. Notify us promptly of any unauthorized use or
        impersonation of your account.
      </p>

      <h2>5. Data accuracy</h2>
      <p>
        We tag figures on the platform with a data source and confidence level so you can judge reliability. Despite
        our verification efforts, data may be incomplete, delayed, or contain errors. The Service is provided for
        informational purposes and should not be the sole basis for a financial, legal, or investment decision — see
        our <a href="/disclaimer" className="text-accent hover:underline">Disclaimer</a>.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Scrape, crawl, or bulk-extract data from the Service using automated means without our written permission</li>
        <li>Enumerate, harvest, or attempt to identify other users&apos; accounts or private data</li>
        <li>Reverse engineer, decompile, or attempt to derive the source code of the Service</li>
        <li>Interfere with or disrupt the Service&apos;s infrastructure, or bypass rate limits or security controls</li>
        <li>Impersonate any person or entity, or misrepresent your affiliation with one</li>
        <li>Use the Service for any fraudulent or unlawful purpose</li>
      </ul>
      <p>
        Public real-estate information itself (project, builder, and locality pages) is meant to be browsed and
        referenced; the restriction above is about automated bulk extraction and attempts to access private user
        data, not about viewing or citing public information normally.
      </p>

      <h2>7. User-submitted content</h2>
      <p>
        If the Service allows you to submit content (e.g. feedback, corrections, or — where enabled — reviews), you
        retain ownership of it, but grant us a license to use, display, and moderate it in connection with operating
        the Service. Don&apos;t submit content that is false, infringing, or unlawful. We may remove submitted content
        at our discretion.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The NoDalalTalks name, logo, website, software, UI, and our own curated analysis, scores, summaries, and
        proprietary datasets are owned by NoDalalTalks. Underlying factual data (e.g. government transaction records)
        remains subject to its original source&apos;s terms where applicable. Nothing here grants you rights to our
        brand, software, or datasets beyond ordinary use of the Service.
      </p>

      <h2>9. Account suspension, deactivation &amp; termination</h2>
      <p>
        You may deactivate your own account at any time from Settings — this is reversible; signing back in
        reactivates it. We may suspend or terminate access for any account found to violate these Terms, without
        that being a promise to do so in every case.
      </p>

      <h2>10. Service availability</h2>
      <p>We aim to keep the Service available but do not guarantee uninterrupted or error-free operation.</p>

      <h2>11. Disclaimer of warranties &amp; limitation of liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind, express or implied. NoDalalTalks
        does not guarantee property value, investment returns, transaction completion, developer performance, future
        appreciation, legal title, construction quality, or any financial outcome. To the maximum extent permitted by
        law, NoDalalTalks is not liable for indirect, incidental, or consequential damages arising from use of the
        Service or reliance on its data.
      </p>

      <h2>12. Governing law &amp; disputes</h2>
      <p>
        {/* FOUNDER ACTION REQUIRED: confirm the governing jurisdiction and venue for disputes as the company's
            registered entity and structure are finalized. */}
        As NoDalalTalks operates from India today, these Terms are intended to be governed by Indian law unless a
        specific regional addendum applies to you. We intend to formalize a clearer venue/arbitration clause as the
        company&apos;s legal structure is finalized.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>We may update these Terms as the product evolves. Continued use after a change means you accept the revised Terms.</p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Reach us via the{" "}
        <a href="/contact" className="text-accent hover:underline">Contact</a> page.
      </p>
    </LegalPageShell>
  );
}
