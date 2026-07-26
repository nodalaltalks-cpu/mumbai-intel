import type { ReactNode } from "react";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";

/** Shared shell for real (non-placeholder) content pages: about, legal, help, faq. */
export default function LegalPageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-col gap-5 text-sm leading-relaxed text-foreground [&_h2]:mt-2 [&_h2]:font-mono [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted [&_li]:mt-1">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
