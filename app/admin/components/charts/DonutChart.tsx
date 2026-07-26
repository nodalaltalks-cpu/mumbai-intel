export interface DonutDatum {
  label: string;
  count: number;
  colorVar: string; // css custom property name, e.g. "--accent"
}

const R = 40;
const CX = 50;
const CY = 50;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function DonutChart({ data, emptyLabel = "No data yet" }: { data: DonutDatum[]; emptyLabel?: string }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-sm border border-dashed border-border">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">{emptyLabel}</p>
      </div>
    );
  }

  const segments: { label: string; colorVar: string; dash: number; gap: number; offset: number }[] = [];
  let cursor = 0;
  for (const d of data) {
    if (d.count === 0) continue;
    const fraction = d.count / total;
    const dash = fraction * CIRCUMFERENCE;
    segments.push({ label: d.label, colorVar: d.colorVar, dash, gap: CIRCUMFERENCE - dash, offset: -cursor * CIRCUMFERENCE });
    cursor += fraction;
  }

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={14} />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={`var(${s.colorVar})`}
            strokeWidth={14}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <ul className="flex flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `var(${d.colorVar})` }} />
            <span className="text-muted">{d.label}</span>
            <span className="font-mono text-foreground">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
