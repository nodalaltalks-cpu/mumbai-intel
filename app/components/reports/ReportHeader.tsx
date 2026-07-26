import { formatDate } from "@/lib/format";

export interface ReportMetaItem {
  label: string;
  value: string;
}

/** Document-style header shared by every report type — kicker, title, subtitle, a generated-on stamp and a few key facts. */
export default function ReportHeader({
  kicker,
  title,
  subtitle,
  meta = [],
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  meta?: ReportMetaItem[];
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">
            {kicker}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted">Generated {formatDate(new Date())}</span>
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {meta.length > 0 ? (
          <div className="flex flex-wrap gap-6 border-t border-border pt-4">
            {meta.map((item) => (
              <div key={item.label}>
                <p className="text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
                <p className="mt-0.5 font-mono text-sm text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
