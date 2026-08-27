import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Disclaimer - NoDalalTalks",
  description: "NoDalalTalks provides real estate market information for informational purposes only, not financial, legal, or investment advice.",
};

export default function DisclaimerPage() {
  return (
    <LegalPageShell
      title="Disclaimer"
      subtitle={`Effective ${formatDate(new Date("2026-07-01"))} · Last updated ${formatDate(new Date("2026-08-27"))}`}
    >
      <h2>Not financial, legal or investment advice</h2>
      <p>
        NoDalalTalks provides real estate market information, including pricing, project status, transaction history,
        and derived analytics, for general informational purposes only. Nothing here is a guarantee of property
        value, investment returns, transaction completion, developer performance, future appreciation, legal title,
        construction quality, or any other financial outcome. It should not be relied upon as the sole basis for any
        property transaction or investment decision.
      </p>

      <h2>Not a brokerage or transaction facilitator</h2>
      <p>
        We do not list properties for sale, broker deals, negotiate on your behalf, or take any commission or fee tied
        to a transaction. Any decision to purchase, sell, lease, or invest in a property is entirely your own and
        should involve independent due diligence and, where appropriate, licensed professional advice (a registered
        real estate agent, lawyer, or financial advisor).
      </p>

      <h2>Data accuracy and sources</h2>
      <p>
        Every figure on the platform is tagged with a data source (Govt Verified, Builder Data, Analyst Verified,
        Estimated, or Community) and a confidence level, so you can judge how much weight to give it. Estimated and
        community-submitted figures in particular may be inaccurate or outdated. Always independently verify RERA
        registration, title, pricing, and possession details directly with the developer or relevant authority before
        acting.
      </p>

      <h2>Third-party links</h2>
      <p>Where the Service links to external sites or sources, we are not responsible for the content or accuracy of those third parties.</p>

      <h2>No liability</h2>
      <p>
        To the maximum extent permitted by law, NoDalalTalks and its operators are not liable for any loss or damage
        arising from reliance on information provided through the Service.
      </p>
    </LegalPageShell>
  );
}
