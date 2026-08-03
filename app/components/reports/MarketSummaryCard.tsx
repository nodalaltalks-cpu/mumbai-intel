/**
 * Prominent narrative callout — renders the Analytics Engine's
 * `calculateMarketSummary` string for a report. `locked` swaps the real
 * narrative for a generic placeholder instead of masking it in place,
 * because these summaries are free-form sentences that can embed exact
 * scores/prices/percentages inline (e.g. "...an investment score of
 * 8.5/10...") — there's no single number to substitute, so the whole
 * sentence is replaced.
 */
export default function MarketSummaryCard({ summary, locked = false }: { summary: string; locked?: boolean }) {
  return (
    <div className="rounded-sm border border-l-2 border-accent/30 border-l-accent bg-accent/5 p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Market Summary</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        {locked ? "Sign in to view the full market summary, including scores, pricing and trend analysis." : summary}
      </p>
    </div>
  );
}
