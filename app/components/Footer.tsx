import Link from "next/link";
import { version as APP_VERSION } from "@/package.json";
import { formatDate } from "@/lib/format";
import { getPlatformDataFreshness } from "@/lib/queries";
import NewsletterForm from "./NewsletterForm";

type FooterLink = { label: string; href: string } | { label: string; comingSoon: true };

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Mirrors the header's five primary product areas exactly (Navbar.tsx's
 * NAV_LINKS) -- no separate "Market Intelligence" taxonomy, no Builder/
 * Locality treated as standalone destinations. Every link resolves to a
 * page that actually exists (verified against the app/ route tree).
 */
const EXPLORE: FooterColumn = {
  title: "Explore",
  links: [
    { label: "Projects", href: "/projects" },
    { label: "Transactions", href: "/transactions" },
    { label: "Reports", href: "/reports" },
    { label: "Market Data", href: "/market-data" },
    { label: "Insights", href: "/insights" },
  ],
};

const COMPANY: FooterColumn = {
  title: "Company",
  links: [
    { label: "About Us", href: "/about" },
    { label: "Contact Us", href: "/contact" },
  ],
};

const RESOURCES: FooterColumn = {
  title: "Resources",
  links: [
    { label: "FAQ", href: "/faq" },
    { label: "Help Center", href: "/help" },
    { label: "Blog", comingSoon: true },
  ],
};

const COLUMNS: FooterColumn[] = [EXPLORE, COMPANY, RESOURCES];

/** Only real, published legal pages — a legal row is the wrong place for "coming soon" placeholders. */
const LEGAL_LINKS: { label: string; href: string }[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Disclaimer", href: "/disclaimer" },
];

const TRUST_BADGES = ["Verified Data", "Source Referenced", "RERA Referenced", "Privacy First"];

/** X/YouTube were removed outright (no NoDalalTalks presence on either), not left as dead links. */
function SocialIcon({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </a>
  );
}

function CheckBadgeIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2.25 2.25 4.5-4.5m4.5 2.25a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function FooterLinkItem({ link }: { link: FooterLink }) {
  if ("href" in link) {
    return (
      <Link href={link.href} className="text-xs text-muted transition-colors hover:text-accent">
        {link.label}
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted/60">
      {link.label}
      <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted/60">Soon</span>
    </span>
  );
}

/**
 * Renders each column twice — a native <details>/<summary> accordion (no JS
 * needed, fully keyboard/screen-reader accessible by default) shown only on
 * mobile, and a plain always-visible list shown from `md:` up. Both contain
 * the exact same real <a> tags, so nothing here affects crawlability — a
 * bot sees every link regardless of which variant is display:none.
 */
function FooterColumnBlock({ column }: { column: FooterColumn }) {
  const listId = `footer-${column.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <details className="group block md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-foreground marker:content-none">
          {column.title}
          <span className="text-muted transition-transform group-open:rotate-45" aria-hidden="true">
            +
          </span>
        </summary>
        <nav aria-label={column.title}>
          <ul className="mt-3 flex flex-col gap-2 pb-1">
            {column.links.map((link) => (
              <li key={link.label}>
                <FooterLinkItem link={link} />
              </li>
            ))}
          </ul>
        </nav>
      </details>

      <div className="hidden md:block">
        <h3 id={listId} className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
          {column.title}
        </h3>
        <nav aria-labelledby={listId}>
          <ul className="mt-3 flex flex-col gap-2">
            {column.links.map((link) => (
              <li key={link.label}>
                <FooterLinkItem link={link} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export default async function Footer() {
  const lastUpdated = await getPlatformDataFreshness();
  const buildNumber = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-5">
        <div className="col-span-2">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
            NODALAL<span className="text-accent">TALKS</span>
          </span>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            No Spam Calls. No Phone Number Required. Research First.
          </p>
          <p className="mt-2 max-w-[22rem] text-xs leading-relaxed text-muted">
            Research a property before anyone tries to sell you one. Verified project, transaction and market data —
            no phone number required to explore it.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <SocialIcon label="LinkedIn" href="https://www.linkedin.com/company/nodalaltalks/">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.98 1.83-2 3.77-2 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.44-2.2 2.96V21H9z" />
              </svg>
            </SocialIcon>
            <SocialIcon label="Instagram" href="https://www.instagram.com/nodalaltalks/">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
            </SocialIcon>
            <a
              href="mailto:Nodalaltalks02@gmail.com"
              title="Email us"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          </div>

          <div className="mt-6 max-w-[22rem]">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Stay Ahead of the Market</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Weekly research on new launches, market trends and transaction insights.
            </p>
            <NewsletterForm />
          </div>
        </div>

        {COLUMNS.map((column) => (
          <FooterColumnBlock key={column.title} column={column} />
        ))}
      </div>

      <div className="border-t border-border px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Trust &amp; Transparency</p>
          <ul className="mt-2.5 flex flex-wrap items-center gap-2">
            {TRUST_BADGES.map((badge) => (
              <li
                key={badge}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted"
              >
                <CheckBadgeIcon />
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-[11px] text-muted">
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-accent">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col items-start justify-between gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <div>
              <p>&copy; {new Date().getFullYear()} NoDalalTalks. All Rights Reserved.</p>
              <p className="mt-0.5">No phone number required. No spam calls. Just better property decisions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wide">
              <span>v{APP_VERSION}</span>
              <span>Build {buildNumber}</span>
              <span>Data updated {lastUpdated ? formatDate(lastUpdated) : "—"}</span>
              <span className="flex items-center gap-1 text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true" />
                Operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
