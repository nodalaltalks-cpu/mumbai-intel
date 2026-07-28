import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The public auth pages are deliberately light and refined — a clean,
 * customer-facing sign-in experience that sits comfortably inside the same
 * premium NoDalalTalks design system as the rest of the application.
 */
export default function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Mumbai<span className="text-accent">Intel</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8 shadow-[0_1px_2px_rgba(24,24,27,0.08),0_16px_40px_-12px_rgba(24,24,27,0.12)]">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}

          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
