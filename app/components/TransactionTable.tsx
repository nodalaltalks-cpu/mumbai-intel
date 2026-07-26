import Link from "next/link";
import { formatDate, formatPaise, formatPricePerSqft, formatSqft } from "@/lib/format";
import { STATUS_CLASS, STATUS_LABEL, TRANSACTION_TYPE_LABEL, type ProjectStatus, type TransactionType } from "@/lib/project-meta";
import type { PublicTransaction } from "@/lib/queries";

export default function TransactionTable({ transactions }: { transactions: PublicTransaction[] }) {
  return (
    <div className="max-h-[640px] overflow-auto rounded-sm border border-border">
      <table className="w-full min-w-[960px] border-collapse text-left text-xs">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Project / Locality</th>
            <th className="px-3 py-2 font-medium">Builder</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Config</th>
            <th className="px-3 py-2 text-right font-medium">Carpet Area</th>
            <th className="px-3 py-2 font-medium">Floor</th>
            <th className="px-3 py-2 text-right font-medium">Price</th>
            <th className="px-3 py-2 text-right font-medium">₹/sqft</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-raised">
              <td className="px-3 py-2 text-muted">
                <Link href={`/transactions/${tx.id}`} className="block hover:text-accent">
                  {formatDate(tx.registrationDate)}
                </Link>
              </td>
              <td className="px-3 py-2 font-sans text-foreground">
                <Link href={`/transactions/${tx.id}`} className="hover:text-accent">
                  {tx.projectName ?? tx.localityName}
                </Link>
                {tx.projectName ? <p className="text-[10px] font-sans text-muted">{tx.localityName}</p> : null}
              </td>
              <td className="px-3 py-2 font-sans text-muted">{tx.builderName ?? "--"}</td>
              <td className="px-3 py-2 font-sans text-muted">{TRANSACTION_TYPE_LABEL[tx.type as TransactionType]}</td>
              <td className="px-3 py-2 text-muted">{tx.bedrooms !== null ? `${tx.bedrooms} BHK` : "--"}</td>
              <td className="px-3 py-2 text-right text-muted">{formatSqft(tx.carpetSqft)}</td>
              <td className="px-3 py-2 text-muted">{tx.floor ?? "--"}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatPaise(tx.valuePaise)}</td>
              <td className="px-3 py-2 text-right text-muted">{formatPricePerSqft(tx.pricePerSqftPaise)}</td>
              <td className="px-3 py-2">
                {tx.projectStatus ? (
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${STATUS_CLASS[tx.projectStatus as ProjectStatus]}`}
                  >
                    {STATUS_LABEL[tx.projectStatus as ProjectStatus]}
                  </span>
                ) : (
                  <span className="text-muted">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
