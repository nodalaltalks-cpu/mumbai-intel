"use client";

import { useRef, useState } from "react";
import { formatMonth, formatPaise } from "@/lib/format";
import { CATEGORY_LABEL, type PropertyCategory } from "@/lib/project-meta";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export interface LineChartPoint {
  month: string; // ISO date
  value: number | null;
}

/** Generic hover-enabled SVG line chart, reused for both average and median price trend. */
export function TransactionLineChart({ points, ariaLabel }: { points: LineChartPoint[]; ariaLabel: string }) {
  const formatValue = (v: number) => formatPaise(v);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const usable = points.filter((p): p is { month: string; value: number } => p.value !== null);

  if (usable.length < 2) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Insufficient data</p>
        <p className="max-w-xs text-xs text-muted">Trend appears once at least two months of transactions are recorded.</p>
      </div>
    );
  }

  const values = usable.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yPad = range * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xAt = (i: number) => PAD_LEFT + (plotWidth * i) / (usable.length - 1);
  const yAt = (v: number) => PAD_TOP + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

  const linePath = usable.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.value)}`).join(" ");
  const areaPath = `${linePath} L${xAt(usable.length - 1)},${PAD_TOP + plotHeight} L${xAt(0)},${PAD_TOP + plotHeight} Z`;
  const yTicks = [yMin + yPad, (yMin + yMax) / 2, yMax - yPad];
  const lastIndex = usable.length - 1;

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (event.clientX - rect.left) * scaleX;
    const ratio = (localX - PAD_LEFT) / plotWidth;
    const index = Math.round(ratio * (usable.length - 1));
    setHoverIndex(Math.max(0, Math.min(usable.length - 1, index)));
  }

  const hovered = hoverIndex !== null ? usable[hoverIndex] : null;

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yAt(tick)} y2={yAt(tick)} stroke="var(--border)" strokeDasharray="2,3" />
            <text x={PAD_LEFT - 8} y={yAt(tick) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        <path d={areaPath} fill="var(--accent)" fillOpacity="0.08" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        {hoverIndex !== null ? (
          <>
            <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={PAD_TOP} y2={PAD_TOP + plotHeight} stroke="var(--accent)" strokeDasharray="2,2" />
            <circle cx={xAt(hoverIndex)} cy={yAt(usable[hoverIndex].value)} r="3" fill="var(--accent)" />
          </>
        ) : null}
        <text x={xAt(0)} y={HEIGHT - 8} fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
          {formatMonth(usable[0].month)}
        </text>
        <text x={xAt(lastIndex)} y={HEIGHT - 8} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
          {formatMonth(usable[lastIndex].month)}
        </text>
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>
      {hovered ? (
        <div className="mi-fade-in pointer-events-none absolute right-2 top-2 rounded-sm border border-border bg-surface px-2 py-1 text-[10px] font-mono shadow-sm">
          <p className="text-muted">{formatMonth(hovered.month)}</p>
          <p className="text-foreground">{formatValue(hovered.value)}</p>
        </div>
      ) : null}
    </div>
  );
}

export function TransactionVolumeChart({ points }: { points: { month: string; count: number }[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted">
        No transactions recorded yet.
      </div>
    );
  }
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="flex h-[160px] items-end gap-1.5">
      {points.map((p, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center gap-1">
          <div className="relative flex w-full flex-1 items-end">
            <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[9px] font-mono text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {p.count}
            </span>
            <div
              className="w-full rounded-t-sm bg-accent/70 transition-[height,background-color] duration-300 group-hover:bg-accent"
              style={{ height: `${Math.max(2, (p.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted">{formatMonth(p.month)}</span>
        </div>
      ))}
    </div>
  );
}

const CHART_COLOR_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6", "--chart-7"];

interface DistributionRow {
  key: string;
  label: string;
  count: number;
}

/** Shared render for every label+count horizontal bar list — each row gets a distinct hue from the qualitative chart palette (--chart-1..7) instead of a uniform accent fill, so multi-category breakdowns are distinguishable by color, not just label text. */
function DistributionBars({ rows, labelWidthClass = "w-28" }: { rows: DistributionRow[]; labelWidthClass?: string }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted">
        No data yet.
      </div>
    );
  }
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className={`${labelWidthClass} shrink-0 truncate text-xs text-foreground`}>{r.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surface">
            <div
              className="h-full rounded-sm transition-[width] duration-300"
              style={{ width: `${(r.count / max) * 100}%`, backgroundColor: `var(${CHART_COLOR_VARS[i % CHART_COLOR_VARS.length]})` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-xs text-muted">
            {r.count} ({total > 0 ? Math.round((r.count / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}

/** Generic label+count horizontal bar list — used for any simple distribution (status, city, price band, …). */
export function LabeledDistributionBars({ buckets }: { buckets: { label: string; count: number }[] }) {
  return <DistributionBars rows={buckets.map((b) => ({ key: b.label, label: b.label, count: b.count }))} />;
}

export function ConfigurationDistribution({ buckets }: { buckets: { bedrooms: number; count: number }[] }) {
  return (
    <DistributionBars
      labelWidthClass="w-16"
      rows={buckets.map((b) => ({
        key: String(b.bedrooms),
        label: `${Number.isInteger(b.bedrooms) ? b.bedrooms : b.bedrooms.toFixed(1)} BHK`,
        count: b.count,
      }))}
    />
  );
}

export function PropertyTypeDistribution({ buckets }: { buckets: { category: string; count: number }[] }) {
  return (
    <DistributionBars
      rows={buckets.map((b) => ({
        key: b.category,
        label: b.category === "UNSPECIFIED" ? "Unspecified" : CATEGORY_LABEL[b.category as PropertyCategory],
        count: b.count,
      }))}
    />
  );
}
