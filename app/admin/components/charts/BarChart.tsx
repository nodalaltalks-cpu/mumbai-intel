export interface BarChartDatum {
  label: string;
  count: number;
}

export default function BarChart({ data, emptyLabel = "No data yet" }: { data: BarChartDatum[]; emptyLabel?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-border">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">{emptyLabel}</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-right text-[11px] text-muted" title={d.label}>
            {d.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-sm bg-surface-raised">
            <div
              className="h-full rounded-sm bg-accent transition-[width]"
              style={{ width: `${Math.max(2, (d.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-[11px] text-foreground">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
