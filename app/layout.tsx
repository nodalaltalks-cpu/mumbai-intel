import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import PremiumGateProvider from "@/app/components/premium/PremiumGateProvider";
import GoogleLoginPing from "@/app/components/analytics/GoogleLoginPing";
import { getSession } from "@/lib/auth/session";
import { getPublicSession } from "@/lib/public-auth/session";
import "./globals.css";

// Public by design — a GA4 Measurement ID is not a secret (it's visible in
// every page's rendered HTML on any site that uses it); it's just the
// property identifier. Unset in an environment (e.g. local dev without a
// configured .env value) means GoogleAnalytics below simply isn't rendered.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "NoDalalTalks";
const SITE_DESCRIPTION =
  "Research Mumbai real estate projects, transactions, and builder track records — no phone number required, every fact tagged by source.";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

// A `title.template` would double up every page's title: the existing
// convention (dozens of generateMetadata calls across the app, e.g.
// `${project.name} — NoDalalTalks`) already writes the full title itself, so
// this stays a plain default rather than a template that re-appends the suffix.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — Real Estate Intelligence`,
  description: SITE_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Real Estate Intelligence`,
    description: SITE_DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Real Estate Intelligence`,
    description: SITE_DESCRIPTION,
  },
};

// `viewportFit: "cover"` lets public-site fixed/bottom UI reach under a
// notch/gesture-nav area using `env(safe-area-inset-*)` padding — harmless
// on desktop (only affects mobile browser chrome), so safe at the root.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read once here (in addition to Navbar's own read — cheap, JWT-only, no DB
  // call) so the 60s guest research nudge knows to stay off for anyone
  // already signed in, founder or public, on every route including /admin.
  const [founderSession, publicSession] = await Promise.all([getSession(), getPublicSession()]);
  const isGuest = !founderSession && !publicSession;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-xs focus:font-mono focus:font-semibold focus:uppercase focus:tracking-wide focus:text-white"
        >
          Skip to content
        </a>
        <PremiumGateProvider isGuest={isGuest}>{children}</PremiumGateProvider>
        <GoogleLoginPing />
        {GA_MEASUREMENT_ID ? <GoogleAnalytics gaId={GA_MEASUREMENT_ID} /> : null}
      </body>
    </html>
  );
}
