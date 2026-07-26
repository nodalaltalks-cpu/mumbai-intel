import Link from "next/link";

type FooterLink = { label: string; href: string } | { label: string; comingSoon: true };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Projects", href: "/projects" },
      { label: "Builders", href: "/builders" },
      { label: "Localities", href: "/localities" },
      { label: "Transactions", href: "/transactions" },
      { label: "Reports", href: "/reports" },
      { label: "Market Data", href: "/market-data" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Mumbai Intel", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Careers", comingSoon: true },
      { label: "Press", comingSoon: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Disclaimer", href: "/disclaimer" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "FAQ", href: "/faq" },
      { label: "API", comingSoon: true },
    ],
  },
];

/** Icon-only, visually present but not yet linked to a real account — see comment below. */
function SocialIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      title={`${label} — coming soon`}
      aria-label={`${label} (coming soon)`}
      className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-sm border border-border text-muted/60"
    >
      {children}
    </span>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-6">
        <div className="col-span-2 md:col-span-2">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
            MUMBAI<span className="text-accent">INTEL</span>
          </span>
          <p className="mt-2 max-w-[22rem] text-xs leading-relaxed text-muted">
            Real estate intelligence for Mumbai — every fact tagged by source, every price
            traceable to its origin.
          </p>

          {/* Real company social accounts not created yet — icons are placeholders, not fabricated links. Swap in real hrefs (and remove SocialIcon's disabled styling) once the accounts exist. */}
          <div className="mt-4 flex items-center gap-2">
            <SocialIcon label="LinkedIn">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.98 1.83-2 3.77-2 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.44-2.2 2.96V21H9z" />
              </svg>
            </SocialIcon>
            <SocialIcon label="X (Twitter)">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.9 3H21l-6.7 7.66L22 21h-6.4l-5-6.6L4.7 21H2.6l7.16-8.18L2 3h6.5l4.53 6.03L18.9 3zm-1.12 16.2h1.17L7.3 4.73H6.05L17.78 19.2z" />
              </svg>
            </SocialIcon>
            <Link
              href="/contact"
              title="Contact us"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </Link>
          </div>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              {column.title}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  {"href" in link ? (
                    <Link href={link.href} className="text-xs text-muted transition-colors hover:text-accent">
                      {link.label}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-muted/60">
                      {link.label}
                      <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted/60">Soon</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 text-[11px] text-muted sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} Mumbai Intel. Data sourced and verified per listed provenance.</p>
          <p className="font-mono uppercase tracking-wide">Mumbai · Maharashtra · India</p>
        </div>
      </div>
    </footer>
  );
}
