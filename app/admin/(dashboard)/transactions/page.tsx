import Link from "next/link";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/guard";
import { getTransactionsAdminPaged } from "@/lib/admin-queries";
import { deleteTransactionAction } from "@/lib/actions/transactions";
import { formatDate, formatPaise, formatPricePerSqft } from "@/lib/format";
import { TRANSACTION_TYPE_LABEL, type TransactionType } from "@/lib/project-meta";
import ConfirmButton from "@/app/admin/components/ConfirmButton";
import FlashMessage from "@/app/admin/components/FlashMessage";
import Pagination from "@/app/admin/components/Pagination";

export const metadata: Metadata = { title: "Transaction Management — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; saved?: string; q?: string; type?: string; sort?: string; page?: string }>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const { items: transactions, total, totalPages } = await getTransactionsAdminPaged({
    q: params.q,
    type: params.type,
    sortBy: params.sort,
    page,
    pageSize: 50,
  });

  function buildHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.type) qs.set("type", params.type);
    if (params.sort) qs.set("sort", params.sort);
    if (targetPage > 1) qs.set("page", String(targetPage));
    const qsString = qs.toString();
    return qsString ? `/admin/transactions?${qsString}` : "/admin/transactions";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold text-foreground">Transaction Management</h1>
          <p className="text-xs text-muted">{total} total</p>
        </div>
        <Link
          href="/admin/transactions/new"
          className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
        >
          New Transaction
        </Link>
      </div>

      <FlashMessage type={params.created ? "created" : params.saved ? "saved" : null} />

      <form className="flex flex-wrap items-center gap-2" action="/admin/transactions" method="get">
        <input
          type="text"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search locality, project, tower, unit…"
          className="w-full max-w-xs rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted"
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
        >
          <option value="">All types</option>
          {Object.entries(TRANSACTION_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={params.sort ?? ""}
          className="rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
        >
          <option value="">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="value_desc">Value: high to low</option>
          <option value="value_asc">Value: low to high</option>
          <option value="ppsf_desc">Rate: high to low</option>
        </select>
        <button
          type="submit"
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Apply
        </button>
        {params.q || params.type || params.sort ? (
          <Link href="/admin/transactions" className="text-xs text-muted hover:text-accent">
            Clear
          </Link>
        ) : null}
      </form>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border py-14 text-center">
          <p className="font-mono text-xs uppercase tracking-wide text-muted">No transactions yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Locality</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <td className="px-3 py-2 text-muted">{formatDate(tx.registrationDate)}</td>
                  <td className="px-3 py-2 text-foreground">{tx.locality.name}</td>
                  <td className="px-3 py-2 text-muted">{tx.project?.name ?? "--"}</td>
                  <td className="px-3 py-2 text-muted">{TRANSACTION_TYPE_LABEL[tx.type as TransactionType]}</td>
                  <td className="px-3 py-2 text-right text-foreground">{formatPaise(tx.valuePaise)}</td>
                  <td className="px-3 py-2 text-right text-muted">{formatPricePerSqft(tx.pricePerSqftPaise)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2 font-sans">
                      <Link
                        href={`/admin/transactions/${tx.id}/edit`}
                        className="rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                      >
                        Edit
                      </Link>
                      {isAdmin ? <ConfirmButton action={deleteTransactionAction.bind(null, tx.id)} label="Trash" /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={buildHref} />
    </div>
  );
}
