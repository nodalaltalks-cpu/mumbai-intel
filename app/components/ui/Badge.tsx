import type { ReactNode } from "react";

export type BadgeTone = "accent" | "positive" | "negative" | "info" | "warning" | "muted";

const TONE_CLASS: Record<BadgeTone, string> = {
  accent: "border-accent/40 bg-accent/10 text-accent",
  positive: "border-positive/40 bg-positive/10 text-positive",
  negative: "border-negative/40 bg-negative/10 text-negative",
  info: "border-info/40 bg-info/10 text-info",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "border-border text-muted",
};

/** Small uppercase pill — the one badge primitive used for every status/source/flag tag site-wide. */
export default function Badge({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
