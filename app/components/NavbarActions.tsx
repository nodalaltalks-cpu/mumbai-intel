"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import GlobalSearch from "./GlobalSearch";
import ProfileMenu from "./ProfileMenu";
import Button from "@/app/components/ui/Button";
import { IconSearch } from "@/app/components/ui/icons";
import { useCompareList } from "@/lib/compare-list";
import { usePremiumGate } from "@/lib/premium/gate-context";

export interface NavbarPublicUser {
  name: string | null;
  email: string;
  image: string | null;
}

/** Owns the Navbar's client-side pieces: global search and the signed-in/signed-out control. Deliberately does NOT know about founder auth — the Admin link never reaches this component at all. */
export default function NavbarActions({ publicUser }: { publicUser: NavbarPublicUser | null }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const compareList = useCompareList();
  const { openGate } = usePremiumGate();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setSearchOpen(true)} aria-label="Search" className="!normal-case">
        <IconSearch className="h-3.5 w-3.5" />
        <span className="hidden font-mono text-[10px] uppercase tracking-wide lg:inline">⌘K</span>
      </Button>
      <span className="hidden font-mono text-[10px] uppercase tracking-wide text-muted lg:inline">Mumbai · IST</span>

      <Link
        href="/compare"
        className="flex items-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
      >
        Compare
        {compareList.length > 0 ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">{compareList.length}</span>
        ) : null}
      </Link>

      {publicUser ? (
        <ProfileMenu user={publicUser} />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const next = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
            openGate("direct-signin", next);
          }}
        >
          Sign In
        </Button>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
