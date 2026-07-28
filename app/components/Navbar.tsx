import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getPublicSession } from "@/lib/public-auth/session";
import NavbarActions from "./NavbarActions";
import NavbarShell from "./NavbarShell";
import NavLink from "./NavLink";
import Button from "@/app/components/ui/Button";

const NAV_LINKS = [
  { label: "Projects", href: "/projects" },
  { label: "Builders", href: "/builders" },
  { label: "Localities", href: "/localities" },
  { label: "Transactions", href: "/transactions" },
  { label: "Map", href: "/map" },
  { label: "Reports", href: "/reports" },
  { label: "Market Data", href: "/market-data" },
  { label: "Insights", href: "/insights" },
];

/**
 * Server Component — reads both session cookies here so the "Admin" link and
 * the signed-in/signed-out state are decided before any HTML reaches the
 * client. A public visitor's response never contains the Admin link at all
 * (not hidden via CSS — genuinely absent from the markup), and a public user
 * who happens to also hold a founder session (unlikely, but the two cookies
 * are independent) sees it precisely because they ARE authenticated as
 * founder — matches "only authenticated Founder/Admin users should ever see
 * it," not "founder pages never show it to public accounts."
 */
export default async function Navbar() {
  const [founderSession, publicSession] = await Promise.all([getSession(), getPublicSession()]);

  return (
    <NavbarShell>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
            NODALAL<span className="text-accent">TALKS</span>
          </span>
          <span className="hidden items-center gap-1 rounded-sm border border-positive/30 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-positive sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
            Live
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden md:flex">
          <ul className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavLink href={link.href} className="text-xs uppercase tracking-wide transition-colors hover:text-accent">
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <NavbarActions
            publicUser={publicSession ? { name: publicSession.name, email: publicSession.email, image: publicSession.image } : null}
          />
          {founderSession ? (
            <Button href="/admin" variant="secondary" size="sm">
              Admin
            </Button>
          ) : null}
        </div>
      </div>

      <nav aria-label="Primary mobile" className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 md:hidden">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-sm px-2.5 py-3 text-xs uppercase tracking-wide transition-colors hover:text-accent"
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </NavbarShell>
  );
}
