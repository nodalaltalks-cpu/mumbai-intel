"use client";

import { useEffect } from "react";
import Button from "@/app/components/ui/Button";

/** Catches errors thrown anywhere in the public site's route tree — the root layout itself keeps rendering (Navbar/Footer stay usable), only the failing segment is replaced. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] segment error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-negative">Something went wrong</p>
      <h1 className="font-mono text-xl font-semibold text-foreground">This page hit an unexpected error</h1>
      <p className="max-w-sm text-sm text-muted">
        This is likely a temporary issue. Try again, or head back to the homepage.
      </p>
      <div className="flex gap-3">
        <Button type="button" size="sm" onClick={reset}>
          Try again
        </Button>
        <Button href="/" variant="secondary" size="sm">
          Go home
        </Button>
      </div>
    </div>
  );
}
