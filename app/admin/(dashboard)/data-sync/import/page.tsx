import Link from "next/link";
import type { Metadata } from "next";
import ImportProjectsForm from "./ImportProjectsForm";

export const metadata: Metadata = { title: "Import Projects — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default function ImportProjectsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/admin/data-sync" className="text-xs font-mono text-muted hover:text-foreground">
        ← Data Sync
      </Link>

      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Import Projects</h1>
        <p className="text-xs text-muted">Bulk-import Projects from a CSV or JSON file — builder feeds, government exports, or any other file you can obtain legitimately.</p>
      </div>

      <ImportProjectsForm />
    </div>
  );
}
