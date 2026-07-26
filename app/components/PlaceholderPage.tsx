import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";

/** Shared shell for footer-linked pages whose full content isn't written yet — a real, working route rather than a dead "#" link, honest about being a stub. */
export default function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
        <h1 className="font-mono text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
        <p className="text-sm text-muted">
          This page is being finalized. In the meantime,{" "}
          <Link href="/" className="text-accent hover:underline">
            return to the homepage
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
