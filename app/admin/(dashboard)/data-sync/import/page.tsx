import Link from "next/link";
import type { Metadata } from "next";
import ImportProjectsForm from "./ImportProjectsForm";
import ImportBuildersForm from "./ImportBuildersForm";
import ImportLocalitiesForm from "./ImportLocalitiesForm";
import ImportTransactionsForm from "./ImportTransactionsForm";

export const metadata: Metadata = { title: "Import Data — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "projects", label: "Projects" },
  { key: "builders", label: "Builders" },
  { key: "localities", label: "Localities" },
  { key: "transactions", label: "Transactions" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function ImportDataPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const params = await searchParams;
  const entity = (TABS.some((t) => t.key === params.entity) ? params.entity : "projects") as TabKey;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/admin/data-sync" className="text-xs font-mono text-muted hover:text-foreground">
        ← Data Sync
      </Link>

      <div>
        <h1 className="font-mono text-lg font-semibold text-foreground">Import Data</h1>
        <p className="text-xs text-muted">Bulk-import Projects, Builders, Localities, or Transactions from a CSV or JSON file — builder feeds, government exports, or any other file you can obtain legitimately.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/data-sync/import?entity=${t.key}`}
            className={`rounded-sm px-3 py-1.5 text-xs font-mono uppercase tracking-wide ${
              entity === t.key ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-raised hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {entity === "projects" ? <ImportProjectsForm /> : null}
      {entity === "builders" ? <ImportBuildersForm /> : null}
      {entity === "localities" ? <ImportLocalitiesForm /> : null}
      {entity === "transactions" ? <ImportTransactionsForm /> : null}
    </div>
  );
}
