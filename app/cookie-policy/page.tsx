import type { Metadata } from "next";
import LegalPageShell from "@/app/components/LegalPageShell";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cookie Policy — NoDalalTalks",
  description: "The essential cookies NoDalalTalks uses to keep you signed in — no third-party tracking or advertising cookies.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPageShell title="Cookie Policy" subtitle={`Last updated ${formatDate(new Date("2026-07-01"))}`}>
      <p>
        NoDalalTalks uses a minimal set of cookies — no third-party tracking or advertising cookies are used anywhere
        on the Service.
      </p>

      <h2>Essential cookies</h2>
      <ul>
        <li>
          <strong>Session cookie</strong> — set when you sign in, keeps you authenticated. It&apos;s httpOnly (not
          readable by page scripts) and expires automatically.
        </li>
        <li>
          <strong>OAuth state cookie</strong> — set briefly during &quot;Continue with Google&quot; sign-in to prevent
          cross-site request forgery, and cleared immediately after the sign-in flow completes.
        </li>
      </ul>
      <p>These are required for the Service to function and cannot be disabled while remaining signed in.</p>

      <h2>What we don&apos;t use cookies for</h2>
      <p>
        We don&apos;t use cookies for advertising, cross-site tracking, or third-party analytics. Your recent searches
        are stored using your browser&apos;s local storage, not a cookie, and never leave your device.
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can clear cookies via your browser settings at any time; doing so will sign you out of the Service. Since
        we don&apos;t use non-essential cookies, there&apos;s no cookie-preferences panel to configure.
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
