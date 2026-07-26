import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin Sign In — Mumbai Intel",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-surface p-6">
        <span className="font-mono text-sm font-bold tracking-widest text-foreground">
          MUMBAI<span className="text-accent">INTEL</span>
        </span>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">Founder Admin</p>
        <h1 className="mt-4 font-mono text-lg font-semibold text-foreground">Sign in</h1>
        <div className="mt-4">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
