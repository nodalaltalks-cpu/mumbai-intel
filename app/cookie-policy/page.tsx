import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cookie Policy - NoDalalTalks",
  description: "The cookies NoDalalTalks uses — essential cookies always, and analytics cookies only with your consent. No advertising cookies.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPageShell title="Cookie Policy" subtitle={`Last updated ${formatDate(new Date("2026-08-25"))}`}>
      <p>
        NoDalalTalks uses two categories of cookies: essential cookies, which are always active, and analytics
        cookies, which are only set if you accept them on the cookie banner. No advertising cookies are used
        anywhere on the Service.
      </p>

      <h2>Essential cookies</h2>
      <p>Required for the Service to function and cannot be disabled while remaining signed in.</p>
      <ul>
        <li>
          <strong>Session cookie</strong>: set when you sign in, keeps you authenticated. It&apos;s httpOnly (not
          readable by page scripts) and expires automatically.
        </li>
        <li>
          <strong>OAuth state cookie</strong>: set briefly during &quot;Continue with Google&quot; sign-in to prevent
          cross-site request forgery, and cleared immediately after the sign-in flow completes.
        </li>
        <li>
          <strong>Cookie consent cookie</strong>: remembers whether you accepted or declined analytics cookies, so
          you&apos;re not asked again.
        </li>
      </ul>

      <h2>Analytics / research cookies — set only with your consent</h2>
      <p>Only activated if you click &quot;Accept&quot; on the cookie banner. You can decline and continue browsing normally.</p>
      <ul>
        <li>
          <strong>Anonymous visitor cookie</strong>: a random, first-party identifier with no personal information in
          it, used to recognize a returning visitor and understand what an anonymous visitor researched before they
          registered. It cannot be used to look up your name, email, or phone number.
        </li>
        <li>
          <strong>Referral attribution cookie</strong>: set only if you arrive via someone&apos;s share link, so we can
          credit that referral if you go on to register.
        </li>
        <li>
          <strong>Google Analytics</strong>: aggregate traffic measurement, only loaded once analytics cookies are
          accepted.
        </li>
      </ul>

      <h2>Managing cookies</h2>
      <p>
        You can change your choice at any time by clearing your browser&apos;s cookies for this site, which will show
        the banner again on your next visit. Clearing cookies will also sign you out of the Service. Your recent
        searches are stored using your browser&apos;s local storage, not a cookie, and never leave your device.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us via the{" "}
        <a href="/contact" className="text-accent hover:underline">
          Contact
        </a>{" "}
        page.
      </p>
    </LegalPageShell>
  );
}
