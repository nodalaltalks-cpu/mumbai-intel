/** Bordered, standalone stat tile — the "Market Snapshot" style card used across every intelligence page. */
export function StatCard({
  label,
  value,
  accent,
  size = "lg",
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  size?: "lg" | "md";
}) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 font-mono ${size === "lg" ? "text-xl" : "text-lg"} font-semibold ${accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

/** Plain label/value pair — for use inside an already-bordered shared grid container. */
export function Fact({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`font-mono text-sm ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
