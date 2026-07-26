"use client";

import { useRef, useState } from "react";
import { formatMonth, formatPricePerSqft } from "@/lib/format";

export interface PriceTrendChartPoint {
  month: string;
  avgPricePerSqftPaise: number;
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export default function PriceTrendChart({ points }: { points: PriceTrendChartPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border text-center">
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Insufficient data</p>
        <p className="max-w-xs text-xs text-muted">
          Price trend appears once at least two months of price history are recorded.
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.avgPricePerSqftPaise);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yPad = range * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xAt = (i: number) => PAD_LEFT + (plotWidth * i) / (points.length - 1);
  const yAt = (v: number) => PAD_TOP + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.avgPricePerSqftPaise)}`).join(" ");
  const areaPath = `${linePath} L${xAt(points.length - 1)},${PAD_TOP + plotHeight} L${xAt(0)},${PAD_TOP + plotHeight} Z`;

  const yTicks = [yMin + yPad, (yMin + yMax) / 2, yMax - yPad];
  const lastIndex = points.length - 1;

  function handlePointerMove(event: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (event.clientX - rect.left) * scaleX;
    const ratio = (localX - PAD_LEFT) / plotWidth;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Average price per square foot trend, Mumbai"
      >
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 8} y={yAt(tick) + 3} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">
              {formatPricePerSqft(tick)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="var(--accent)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={xAt(lastIndex)} cy={yAt(points[lastIndex].avgPricePerSqftPaise)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        <text
          x={xAt(lastIndex)}
          y={yAt(points[lastIndex].avgPricePerSqftPaise) - 12}
          textAnchor="end"
          fontSize={10}
          fill="var(--foreground)"
          fontFamily="var(--font-mono)"
        >
          {formatPricePerSqft(points[lastIndex].avgPricePerSqftPaise)}
        </text>

        {[0, Math.floor(lastIndex / 2), lastIndex].map((i) => (
          <text key={i} x={xAt(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">
            {formatMonth(points[i].month)}
          </text>
        ))}

        {hoverIndex !== null ? (
          <line
            x1={xAt(hoverIndex)}
            x2={xAt(hoverIndex)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        ) : null}
        {hoverIndex !== null ? (
          <circle
            cx={xAt(hoverIndex)}
            cy={yAt(points[hoverIndex].avgPricePerSqftPaise)}
            r={4}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ) : null}

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
        <div
          className="mi-fade-in pointer-events-none absolute top-2 rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs shadow-lg"
          style={{
            left: `${(xAt(hoverIndex!) / WIDTH) * 100}%`,
            transform: hoverIndex! > lastIndex / 2 ? "translateX(-100%)" : "translateX(0%)",
          }}
        >
          <p className="font-mono font-semibold text-foreground">{formatPricePerSqft(hovered.avgPricePerSqftPaise)}</p>
          <p className="text-[10px] text-muted">{formatMonth(hovered.month)}</p>
        </div>
      ) : null}
    </div>
  );
}
