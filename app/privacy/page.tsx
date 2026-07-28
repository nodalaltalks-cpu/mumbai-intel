import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Privacy Policy — NoDalalTalks",
  description: "How NoDalalTalks collects, uses, and protects your account data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" subtitle={`Last updated ${formatDate(new Date("2026-07-01"))}`}>
      <h2>1. What we collect</h2>
      <p>If you create an account, we collect:</p>
      <ul>
        <li>Name, email address, and (optionally) phone number</li>
        <li>A securely hashed password (if you sign up with email/password) — we never store your password in plain text</li>
        <li>Basic profile info from Google (name, email, profile photo) if you sign in with Google</li>
        <li>Sign-in timestamps, for account security</li>
      </ul>
      <p>If you use the Service without an account, we don&apos;t collect personal information. Recent searches are stored only in your browser&apos;s local storage, never on our servers.</p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To create and maintain your account, and keep you signed in via a session cookie</li>
        <li>To let you save projects to your account</li>
        <li>To send account-related emails (e.g. password reset), and to respond if you contact us</li>
        <li>To maintain the security and integrity of the Service (e.g. rate-limiting login attempts)</li>
      </ul>
      <p>We do not sell your personal information, and we do not use third-party advertising or tracking services.</p>

      <h2>3. Cookies</h2>
      <p>
        We use a single essential, httpOnly session cookie to keep you signed in. See our{" "}
        <a href="/cookie-policy" className="text-accent hover:underline">
          Cookie Policy
        </a>{" "}
        for details.
      </p>

      <h2>4. Data sharing</h2>
      <p>
        We share account data with infrastructure providers strictly necessary to run the Service (database hosting,
        image hosting, and — if configured — an email delivery provider for transactional email). We do not share
        your personal information with third parties for their own marketing purposes.
      </p>

      <h2>5. Data retention</h2>
      <p>We retain account data for as long as your account is active. You may request deletion of your account and associated data at any time via the Contact page.</p>

      <h2>6. Your rights</h2>
      <p>You can access and update your account details from your Account page. To request a copy or deletion of your data, contact us.</p>

      <h2>7. Security</h2>
      <p>Passwords are hashed (never stored in plain text), session tokens are signed and httpOnly, and login attempts are rate-limited. No system is perfectly secure, but we take reasonable measures to protect your data.</p>

      <h2>8. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be reflected here with an updated date.</p>

      <h2>9. Contact</h2>
      <p>
        Questions about this policy or your data? Reach us via the{" "}
        <a href="/contact" className="text-accent hover:underline">
          Contact
        </a>{" "}
        page.
      </p>
    </LegalPageShell>
  );
}
