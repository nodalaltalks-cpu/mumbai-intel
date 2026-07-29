import type { Metadata } from "next";
import { getLocalitiesForSelect, getProjectsForSelect } from "@/lib/admin-queries";
import TransactionForm from "@/app/admin/components/TransactionForm";
import BackButton from "@/app/admin/components/BackButton";

export const metadata: Metadata = { title: "New Transaction — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const [localities, projects] = await Promise.all([getLocalitiesForSelect(), getProjectsForSelect()]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <BackButton fallbackHref="/admin/transactions" />
      <h1 className="font-mono text-lg font-semibold text-foreground">New Transaction</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <TransactionForm localities={localities} projects={projects} />
      </div>
    </div>
  );
}
