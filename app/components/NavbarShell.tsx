"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** Owns just the sticky header's scroll-elevation state — the rest of Navbar stays a Server Component. */
export default function NavbarShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur transition-shadow ${scrolled ? "shadow-sm" : ""}`}
    >
      {children}
    </header>
  );
}
