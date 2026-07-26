import Link from "next/link";
import { formatDate, formatPaise, formatPricePerSqft } from "@/lib/format";
import { TRANSACTION_TYPE_LABEL } from "@/lib/project-meta";
import { getLatestTransactions } from "@/lib/queries";
import SectionHeading from "./ui/SectionHeading";
import EmptyState from "./ui/EmptyState";

export default async function LatestTransactions() {
  const transactions = await getLatestTransactions(8);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading title="Recent Market Activity" subtitle="Most recently registered deals across Mumbai" viewAllHref="/transactions" />

      {transactions.length === 0 ? (
        <EmptyState title="No transactions recorded yet" message="Transaction records added from the Admin Dashboard will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Locality</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2 text-muted">
                    <Link href={`/transactions/${tx.id}`} className="block transition-colors hover:text-accent">
                      {formatDate(tx.registrationDate)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground">{tx.localityName}</td>
                  <td className="px-3 py-2 text-muted">{tx.projectName ?? "--"}</td>
                  <td className="px-3 py-2 text-muted">
                    {TRANSACTION_TYPE_LABEL[tx.type as keyof typeof TRANSACTION_TYPE_LABEL] ?? tx.type}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{formatPaise(tx.valuePaise)}</td>
                  <td className="px-3 py-2 text-right text-muted">{formatPricePerSqft(tx.pricePerSqftPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
