import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  "Research Mumbai real estate projects, transactions, and builder track records — zero spam calls, zero brokerage, every fact tagged by source.";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        {children}
      </body>
    </html>
  );
}
