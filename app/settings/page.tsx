import Link from "next/link";
import type { Metadata } from "next";
import { requirePublicSession } from "@/lib/public-auth/guard";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/actions/public-auth";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import Button from "@/app/components/ui/Button";
import SettingsCookiePreferences from "./SettingsCookiePreferences";
import DeactivateAccountControl from "./DeactivateAccountControl";

export const metadata: Metadata = { title: "Settings - NoDalalTalks" };
export const dynamic = "force-dynamic";

/**
 * Minimal, reuse-first settings page -- every row here links to or wraps an
 * existing feature (profile, notification preferences, cookie consent,
 * password reset, legal pages) rather than re-implementing it. The only
 * genuinely new capability is account deactivation, kept deliberately
 * secondary (small text link, not a card) per the product's own instruction
 * not to make it prominent.
 */
export default async function SettingsPage() {
  const session = await requirePublicSession("/settings");
  const user = await prisma.publicUser.findUnique({ where: { id: session.userId }, select: { name: true, email: true } });

  const Row = ({ title, description, href, label }: { title: string; description: string; href: string; label: string }) => (
    <div className="flex items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <Link href={href} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:border-accent hover:text-accent">
        {label}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="mb-4 font-mono text-lg font-semibold text-foreground">Settings</h1>

        <section className="rounded-sm border border-border bg-surface px-4">
          <h2 className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Account</h2>
          <div className="divide-y divide-border">
            <div className="py-3">
              <p className="text-sm font-medium text-foreground">{user?.name ?? "NoDalalTalks user"}</p>
              <p className="text-xs text-muted">{user?.email}</p>
            </div>
            <Row title="Profile" description="Edit your name, phone, and research preferences." href="/account?tab=profile" label="Edit" />
            <Row title="Notifications" description="Choose which updates you receive." href="/account?tab=profile#notification-preferences" label="Manage" />
            <Row title="Password" description="Reset your password by email." href="/forgot-password" label="Reset" />
          </div>
        </section>

        <section className="mt-4 rounded-sm border border-border bg-surface px-4">
          <h2 className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Privacy</h2>
          <div className="divide-y divide-border">
            <div className="py-3">
              <p className="text-sm font-medium text-foreground">Cookie preferences</p>
              <p className="mb-2 text-xs text-muted">Control analytics cookies at any time.</p>
              <SettingsCookiePreferences />
            </div>
            <Row title="Cookie Policy" description="What cookies we use and why." href="/cookie-policy" label="View" />
            <Row title="Privacy Policy" description="How we handle your data." href="/privacy" label="View" />
          </div>
        </section>

        <section className="mt-4 rounded-sm border border-border bg-surface px-4">
          <h2 className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Legal</h2>
          <div className="divide-y divide-border">
            <Row title="Terms of Service" description="Rules for using NoDalalTalks." href="/terms" label="View" />
            <Row title="Disclaimer" description="Important notes about our information." href="/disclaimer" label="View" />
          </div>
        </section>

        <section className="mt-4 rounded-sm border border-border bg-surface p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Account management</h2>
          <div className="flex flex-col gap-3">
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Logout
              </Button>
            </form>
            <DeactivateAccountControl />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
