"use client";

import { useEffect, useState } from "react";
import GlobalSearch from "./GlobalSearch";
import ProfileMenu from "./ProfileMenu";
import Button from "@/app/components/ui/Button";
import { IconSearch } from "@/app/components/ui/icons";

export interface NavbarPublicUser {
  name: string | null;
  email: string;
  image: string | null;
}

/** Owns the Navbar's client-side pieces: global search and the signed-in/signed-out control. Deliberately does NOT know about founder auth — the Admin link never reaches this component at all. */
export default function NavbarActions({ publicUser }: { publicUser: NavbarPublicUser | null }) {
  const [searchOpen, setSearchOpen] = useState(false);

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

      {publicUser ? (
        <ProfileMenu user={publicUser} />
      ) : (
        <Button href="/login" variant="ghost" size="sm">
          Sign In
        </Button>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
