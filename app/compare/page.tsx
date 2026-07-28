import type { Metadata } from "next";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import CompareView from "./CompareView";

export const metadata: Metadata = { title: "Compare Projects — Mumbai Intel" };

export default function ComparePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <CompareView />
      </main>
      <Footer />
    </div>
  );
}
