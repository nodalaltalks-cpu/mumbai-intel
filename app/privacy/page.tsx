import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Privacy Policy - NoDalalTalks",
  description: "How NoDalalTalks collects, uses, and protects your account data.",
};

const EFFECTIVE_DATE = new Date("2026-07-01");
const LAST_UPDATED = new Date("2026-08-27");

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle={`Effective ${formatDate(EFFECTIVE_DATE)} · Last updated ${formatDate(LAST_UPDATED)}`}
    >
      {/* FOUNDER ACTION REQUIRED: this policy does not name a registered
          legal entity, business address, or (where applicable) a grievance
          officer / data protection contact. Add these once available -- we
          do not invent them here. */}
      <p>
        NoDalalTalks (&quot;we&quot;, &quot;us&quot;) is a real estate research and market-intelligence platform. This
        policy explains what we collect, why, and the choices you have. We&apos;re building NoDalalTalks to serve
        users beyond India over time; where a specific regional right or process doesn&apos;t exist yet, we say so
        rather than claim it does.
      </p>

      <h2>1. What we collect</h2>
      <p>If you create an account:</p>
      <ul>
        <li>Name, email address, and (optionally) phone number with country code</li>
        <li>A securely hashed password (email/password sign-up only) — never stored in plain text</li>
        <li>Basic profile info from Google (name, email, profile photo) if you sign in with Google</li>
        <li>Property research preferences you choose to share: budget, property type, configuration, preferred localities, purpose, and similar fields — all optional</li>
        <li>Saved projects, saved searches, wishlist items, and recent views</li>
        <li>Notification interactions (read/click)</li>
        <li>Sign-in timestamps, for account security</li>
      </ul>
      <p>
        If you use the Service without an account and accept analytics cookies, we also record: search activity,
        which pages you visit, device/browser type, and approximate location (country, and where available
        region/city) inferred from your network connection — never precise GPS coordinates, and never your exact
        address. See <strong>Location data</strong> below. If you decline analytics cookies, none of this is
        collected for that visit.
      </p>

      <h2>2. Why we collect it</h2>
      <ul>
        <li>To create and maintain your account, and keep you signed in</li>
        <li>To personalize research — showing preferences, saved items, and relevant recommendations back to you</li>
        <li>To understand aggregate usage so we can improve search, navigation, and content</li>
        <li>To detect and prevent abuse (e.g. rate-limiting login attempts, blocking duplicate-account creation)</li>
        <li>To send account-related email (e.g. password reset) and respond if you contact us</li>
      </ul>
      <p>We do not sell your personal information, and we do not use third-party advertising or ad-tracking services.</p>

      <h2>3. Cookies</h2>
      <p>
        We use essential cookies (to keep you signed in) always, and analytics cookies only if you accept them. See
        our <a href="/cookie-policy" className="text-accent hover:underline">Cookie Policy</a> for the full list, and{" "}
        <a href="/settings" className="text-accent hover:underline">Settings</a> to change your choice at any time.
      </p>

      <h2>4. Location data</h2>
      <p>
        We do not request or collect GPS/precise location. When analytics cookies are accepted, our hosting provider
        gives us a coarse, IP-derived estimate — country, and where available region/state and city — used only in
        aggregate to understand where visitors are researching from. We never store your raw IP address.
      </p>

      <h2>5. Data sharing</h2>
      <p>
        We share data only with infrastructure providers strictly necessary to run the Service — database hosting,
        image hosting, transactional email delivery, and aggregate analytics measurement. We do not share your
        personal information with third parties for their own marketing purposes.
      </p>

      <h2>6. Data retention, deactivation &amp; deletion</h2>
      <p>
        We retain account data for as long as your account is active. You can deactivate your account at any time
        from <a href="/settings" className="text-accent hover:underline">Settings</a> — deactivation is not deletion:
        your data is preserved and signing back in reactivates your account. To request permanent deletion of your
        account and associated data, contact us; we&apos;ll confirm once processed.
      </p>

      <h2>7. User data isolation &amp; security</h2>
      <p>
        Your profile, saved projects, saved searches, and private activity are visible only to you and to
        NoDalalTalks staff acting on legitimate support/administrative grounds — never to other users. Passwords are
        hashed, session tokens are signed and access-restricted, and access to another user&apos;s private data is
        blocked at the application level, not just hidden in the interface. No system is perfectly secure; we use
        reasonable technical and organizational safeguards, not a guarantee of absolute security.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can view and update most account details directly from your Account page. You can request a copy or
        deletion of your data via Contact. Depending on where you live, additional regional rights (e.g. under the
        EU/EEA&apos;s GDPR or similar frameworks) may apply — as we expand internationally we intend to build the
        processes those rights require; until a specific right is formally supported here, we do not claim it is.
      </p>

      <h2>9. Children&apos;s privacy</h2>
      <p>NoDalalTalks is not directed at children under 18, and we do not knowingly collect their personal information.</p>

      <h2>10. Changes to this policy</h2>
      <p>We may update this policy as the product evolves. Material changes will be reflected here with an updated date.</p>

      <h2>11. Contact</h2>
      <p>
        Questions about this policy or your data? Reach us via the{" "}
        <a href="/contact" className="text-accent hover:underline">Contact</a> page.
      </p>
    </LegalPageShell>
  );
}
