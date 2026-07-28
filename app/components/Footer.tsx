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
 * Every link below resolves to a page that actually exists today (verified
 * against the app/ route tree), or is explicitly marked `comingSoon` — none
 * are fabricated destinations. Several distinct labels intentionally point
 * at the same page (e.g. "Our Mission"/"Our Vision"/"Our Methodology" all
 * go to /about, which covers that ground in one place; "List Your
 * Project"/"Developer Portal"/etc. all go to /contact, a real working
 * channel, rather than five separate not-yet-built portal pages) — that's
 * a deliberate content-consolidation choice, not a placeholder.
 */
const EXPLORE: FooterColumn = {
  title: "Explore",
  links: [
    { label: "Projects", href: "/projects" },
    { label: "Builders", href: "/builders" },
    { label: "Localities", href: "/localities" },
    { label: "Transactions", href: "/transactions" },
    { label: "Market Reports", href: "/reports/market" },
    { label: "Price Trends", href: "/market-data" },
    { label: "Infrastructure", href: "/map" },
    { label: "New Launches", href: "/projects?status=PRE_LAUNCH" },
    { label: "Luxury Projects", href: "/projects?luxury=1" },
    { label: "Affordable Housing", href: "/projects?affordable=1" },
    { label: "Commercial Projects", href: "/projects?category=COMMERCIAL" },
    { label: "Search", href: "/projects" },
    { label: "Map Explorer", href: "/map" },
  ],
};

const MARKET_INTELLIGENCE: FooterColumn = {
  title: "Market Intelligence",
  links: [
    { label: "Project Intelligence", href: "/reports" },
    { label: "Builder Intelligence", href: "/builders" },
    { label: "Locality Intelligence", href: "/localities" },
    { label: "Transaction Intelligence", href: "/reports/transactions" },
    { label: "Price Analysis", href: "/reports/market" },
    { label: "Construction Updates", href: "/projects" },
    { label: "Market Trends", href: "/insights" },
    { label: "Rental Insights", href: "/transactions?type=rental" },
    { label: "Supply & Demand", href: "/reports/market" },
    { label: "Infrastructure Pipeline", href: "/map" },
    { label: "Future Developments", href: "/projects?status=ANNOUNCED" },
    { label: "Research Reports", href: "/reports" },
  ],
};

const COMPANY: FooterColumn = {
  title: "Company",
  links: [
    { label: "About Mumbai Intel", href: "/about" },
    { label: "Our Mission", href: "/about" },
    { label: "Our Vision", href: "/about" },
    { label: "Our Methodology", href: "/about" },
    { label: "How We Verify Data", href: "/about" },
    { label: "Data Collection Process", href: "/about" },
    { label: "Contact Us", href: "/contact" },
    { label: "Business Partnerships", href: "/contact" },
    { label: "Careers", comingSoon: true },
    { label: "Media Kit", comingSoon: true },
    { label: "Press", comingSoon: true },
  ],
};

const DEVELOPERS: FooterColumn = {
  title: "Developers",
  links: [
    { label: "List Your Project", href: "/contact" },
    { label: "Developer Portal", href: "/contact" },
    { label: "Marketing Solutions", href: "/contact" },
    { label: "Enterprise Solutions", href: "/contact" },
    { label: "Data Partnerships", href: "/contact" },
    { label: "Developer Support", href: "/contact" },
    { label: "API Access", comingSoon: true },
  ],
};

const RESOURCES: FooterColumn = {
  title: "Resources",
  links: [
    { label: "Help Center", href: "/help" },
    { label: "FAQ", href: "/faq" },
    { label: "Market Reports", href: "/reports" },
    { label: "Support Center", href: "/contact" },
    { label: "Blog", comingSoon: true },
    { label: "Buying Guides", comingSoon: true },
    { label: "Glossary", comingSoon: true },
    { label: "RERA Guide", comingSoon: true },
  ],
};

const COLUMNS: FooterColumn[] = [EXPLORE, MARKET_INTELLIGENCE, COMPANY, DEVELOPERS, RESOURCES];

/** Only real, published legal pages — a legal row is the wrong place for "coming soon" placeholders. */
const LEGAL_LINKS: { label: string; href: string }[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Data Sources", href: "/about" },
];

const TRUST_BADGES = ["Verified Data", "Source Referenced", "RERA Referenced", "Privacy First", "Enterprise Security", "Research Driven"];

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
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-6 lg:grid-cols-7">
        <div className="col-span-2 md:col-span-2 lg:col-span-2">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
            MUMBAI<span className="text-accent">INTEL</span>
          </span>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            India&apos;s Real Estate Intelligence Platform
          </p>
          <p className="mt-2 max-w-[22rem] text-xs leading-relaxed text-muted">
            Verified project intelligence, transaction insights, builder research and locality analytics for smarter
            property decisions.
          </p>

          {/* Real company social accounts not created yet — icons are placeholders, not fabricated links. The
              email icon is real (mailto:). Swap in real hrefs (and remove SocialIcon's disabled styling) once
              the LinkedIn/X/Instagram/YouTube accounts exist. */}
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
            <SocialIcon label="Instagram">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
            </SocialIcon>
            <SocialIcon label="YouTube">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M22 12s0-3.2-.4-4.6a2.9 2.9 0 00-2-2C17.9 5 12 5 12 5s-5.9 0-7.6.4a2.9 2.9 0 00-2 2C2 8.8 2 12 2 12s0 3.2.4 4.6a2.9 2.9 0 002 2C6.1 19 12 19 12 19s5.9 0 7.6-.4a2.9 2.9 0 002-2C22 15.2 22 12 22 12zM10 15.2V8.8L15.6 12z" />
              </svg>
            </SocialIcon>
            <a
              href="mailto:nodalaltalks02@gmail.com"
              title="Email us"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          </div>

          <div className="mt-6 max-w-[22rem]">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Stay Updated</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Receive weekly Mumbai real estate intelligence, market reports and project insights.
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
              <p>&copy; {new Date().getFullYear()} Mumbai Intel. All Rights Reserved.</p>
              <p className="mt-0.5">Built to bring transparency to India&apos;s real estate market.</p>
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
