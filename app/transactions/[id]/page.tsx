import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicTransactionById, getRelatedTransactions } from "@/lib/queries";
import { formatDate, formatPaise, formatPricePerSqft, formatSqft } from "@/lib/format";
import {
  BUYER_TYPE_LABEL,
  CATEGORY_LABEL,
  SOURCE_CLASS,
  SOURCE_LABEL,
  STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
  type BuyerTypeValue,
  type ProjectStatus,
  type PropertyCategory,
  type TransactionType,
} from "@/lib/project-meta";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import TransactionTable from "@/app/components/TransactionTable";
import { Fact } from "@/app/components/ui/StatCard";
import Breadcrumbs from "@/app/components/Breadcrumbs";
import { recordRecentViewAction } from "@/lib/actions/recent-views";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import PremiumGate from "@/app/components/premium/PremiumGate";
import { getPublicSession } from "@/lib/public-auth/session";
import { gated, maskPaise, maskPricePerSqft } from "@/lib/premium/mask";
import GAPageEvent from "@/app/components/analytics/GAPageEvent";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tx = await getPublicTransactionById(id);
  if (!tx) return { title: "Transaction not found — NoDalalTalks" };
  const title = tx.projectName ? `${tx.projectName} transaction` : `${tx.localityName} transaction`;
  return {
    title: `${title} — NoDalalTalks`,
    description: `Registered transaction record in ${tx.localityName}${tx.projectName ? ` at ${tx.projectName}` : ""} — NoDalalTalks.`,
    // Individual transaction records are thin, near-duplicate content at scale;
    // kept crawlable via internal links (follow) but excluded from indexing.
    robots: { index: false, follow: true },
  };
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = await getPublicTransactionById(id);
  if (!tx) notFound();

  await recordRecentViewAction("Transaction", tx.id);
  await recordResearchEvent("TRANSACTION_VIEWED", { entityType: "Transaction", entityId: tx.id });

  const [{ history, similar }, session] = await Promise.all([getRelatedTransactions(tx), getPublicSession()]);
  const locked = session === null;
  const next = `/transactions/${tx.id}`;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <GAPageEvent event="transaction_viewed" params={{ transaction_id: tx.id }} />
      <Navbar />

      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Transactions", href: "/transactions" },
          { label: tx.projectName ?? tx.localityName },
        ]}
      />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-8 sm:px-6">
          <div>
            <span className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${SOURCE_CLASS[tx.dataSource]}`}>
              {SOURCE_LABEL[tx.dataSource]}
            </span>
            <h1 className="mt-2 font-mono text-2xl font-bold text-foreground">{tx.projectName ?? tx.localityName}</h1>
            <p className="mt-1 text-sm text-muted">
              {tx.localityName}
              {tx.builderName ? ` · ${tx.builderName}` : ""} · {TRANSACTION_TYPE_LABEL[tx.type as TransactionType]}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted">Transaction value</p>
            <p className="font-mono text-3xl text-accent">{gated(locked, formatPaise(tx.valuePaise), maskPaise())}</p>
            <p className="text-xs text-muted">{formatDate(tx.registrationDate)}</p>
          </div>
        </div>
      </div>

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Transaction Details</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
            <Fact label="Configuration" value={tx.bedrooms !== null ? `${tx.bedrooms} BHK` : "--"} />
            <Fact label="Carpet area" value={formatSqft(tx.carpetSqft)} />
            <Fact label="Built-up area" value={formatSqft(tx.builtUpSqft)} />
            <Fact label="Floor" value={tx.floor ?? "--"} />
            <Fact label="Tower / Unit" value={[tx.tower, tx.unitLabel].filter(Boolean).join(" / ") || "--"} />
            <Fact label="Price / sqft" value={gated(locked, formatPricePerSqft(tx.pricePerSqftPaise), maskPricePerSqft())} accent />
            <Fact label="Buyer type" value={tx.buyerType ? BUYER_TYPE_LABEL[tx.buyerType as BuyerTypeValue] : "--"} />
            <Fact label="Registration no." value={tx.sourceRef ?? "--"} />
            <Fact label="Property type" value={tx.propertyCategory ? CATEGORY_LABEL[tx.propertyCategory as PropertyCategory] : "--"} />
            <Fact label="Status" value={tx.projectStatus ? STATUS_LABEL[tx.projectStatus as ProjectStatus] : "--"} />
          </div>
        </section>

        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Related</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RelatedCard label="Project" name={tx.projectName} href={tx.projectSlug ? `/projects/${tx.projectSlug}` : null} />
            <RelatedCard label="Builder" name={tx.builderName} href={tx.builderSlug ? `/builders/${tx.builderSlug}` : null} />
            <RelatedCard label="Locality" name={tx.localityName} href={`/localities/${tx.localitySlug}`} />
          </div>
        </section>

        {tx.projectId ? (
          <section>
            <h2 className="font-mono text-lg font-semibold text-foreground">Historical Transactions in {tx.projectName}</h2>
            {history.length > 0 ? (
              <div className="mt-3">
                <PremiumGate locked={locked} feature="transaction-history" next={next}>
                  <TransactionTable transactions={history} locked={locked} />
                </PremiumGate>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No other registered transactions for this project yet.</p>
            )}
          </section>
        ) : null}

        <section>
          <h2 className="font-mono text-lg font-semibold text-foreground">Similar Nearby Transactions</h2>
          {similar.length > 0 ? (
            <div className="mt-3">
              <PremiumGate locked={locked} feature="transaction-history" next={next}>
                <TransactionTable transactions={similar} locked={locked} />
              </PremiumGate>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No similar nearby transactions recorded yet.</p>
          )}
        </section>

        <div>
          <Link href="/transactions" className="text-xs text-muted hover:text-accent">
            ← Back to all transactions
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}


function RelatedCard({ label, name, href }: { label: string; name: string | null; href: string | null }) {
  if (!name) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-surface p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-sm text-muted">Not available</p>
      </div>
    );
  }
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm text-foreground">{name}</p>
    </>
  );
  if (!href) {
    return <div className="rounded-sm border border-border bg-surface p-4">{content}</div>;
  }
  return (
    <Link href={href} className="block rounded-sm border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-raised">
      {content}
    </Link>
  );
}
