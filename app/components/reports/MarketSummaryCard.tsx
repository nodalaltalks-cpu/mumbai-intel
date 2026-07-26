/** Prominent narrative callout — renders the Analytics Engine's `calculateMarketSummary` string for a report. */
export default function MarketSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-sm border border-l-2 border-accent/30 border-l-accent bg-accent/5 p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Market Summary</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{summary}</p>
    </div>
  );
}
