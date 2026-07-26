import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocalitiesForSelect, getProjectsForSelect, getTransactionForEdit } from "@/lib/admin-queries";
import TransactionForm from "@/app/admin/components/TransactionForm";

export const metadata: Metadata = { title: "Edit Transaction — Mumbai Intel Admin" };
export const dynamic = "force-dynamic";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [transaction, localities, projects] = await Promise.all([
    getTransactionForEdit(id),
    getLocalitiesForSelect(),
    getProjectsForSelect(),
  ]);
  if (!transaction) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="font-mono text-lg font-semibold text-foreground">Edit Transaction</h1>
      <div className="rounded-sm border border-border bg-surface p-4">
        <TransactionForm transaction={transaction} localities={localities} projects={projects} />
      </div>
    </div>
  );
}
