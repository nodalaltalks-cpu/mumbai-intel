import type { LocalityIntelligence } from "@/lib/queries";
import { gated, maskScore } from "@/lib/premium/mask";

const LABEL_TONE: Record<string, string> = {
  Rising: "text-positive",
  High: "text-positive",
  Stable: "text-accent",
  Moderate: "text-accent",
  Cooling: "text-negative",
  Low: "text-negative",
  "Insufficient data": "text-muted",
};

/** `locked` masks the whole panel — demand/supply/investment scores are all "Market Intelligence Scores" per the gating spec. Market Summary text stays visible (descriptive, not a computed score). */
export default function LocalityIntelligencePanel({ intelligence, locked = false }: { intelligence: LocalityIntelligence; locked?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-sm border border-border bg-surface p-4">
        <p className="font-mono text-[11px] uppercase tracking-wide text-accent">Market Summary</p>
        <p className="mt-2 text-sm text-foreground">
          {locked ? "Sign in to view the full market summary, including scores and trend analysis." : intelligence.summary}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <IntelTile
          label="Demand indicator"
          valueLabel={gated(locked, intelligence.demandLabel, "──")}
          score={locked ? null : intelligence.demandScore}
        />
        <IntelTile
          label="Supply indicator"
          valueLabel={gated(locked, intelligence.supplyLabel, "──")}
          score={locked ? null : intelligence.supplyScore}
        />
        <div className="rounded-sm border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted">Investment score</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-accent">
            {gated(locked, intelligence.investmentScore !== null ? `${intelligence.investmentScore.toFixed(1)}/10` : "--", maskScore())}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            {locked ? "Sign in to view" : intelligence.investmentScore === null ? "Not enough data" : intelligence.investmentIsCurated ? "Analyst curated" : "Computed"}
          </p>
        </div>
      </div>
    </div>
  );
}

function IntelTile({ label, valueLabel, score }: { label: string; valueLabel: string; score: number | null }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 font-mono text-xl font-semibold ${LABEL_TONE[valueLabel] ?? "text-foreground"}`}>{valueLabel}</p>
      {score !== null ? <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">Score {score}/10</p> : null}
    </div>
  );
}
