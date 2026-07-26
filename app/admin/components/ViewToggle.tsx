"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "card" ? "card" : "table";

  function setView(next: "table" | "card") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "table") params.delete("view");
    else params.set("view", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-sm border border-border">
      <button
        type="button"
        onClick={() => setView("table")}
        className={`px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
          view === "table" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
        }`}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => setView("card")}
        className={`border-l border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ${
          view === "card" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
        }`}
      >
        Card
      </button>
    </div>
  );
}
