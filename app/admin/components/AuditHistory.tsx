import type { Prisma } from "@prisma/client";
import { formatDate } from "@/lib/format";

type AuditLogRow = {
  id: string;
  action: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  at: Date;
  actor: { name: string | null; email: string } | null;
};

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function diffFields(before: Prisma.JsonValue | null, after: Prisma.JsonValue | null) {
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) || Array.isArray(after)) {
    return [];
  }
  const beforeObj = before as Record<string, unknown>;
  const afterObj = after as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  return keys
    .filter((key) => JSON.stringify(beforeObj[key]) !== JSON.stringify(afterObj[key]))
    .map((key) => ({ field: key, before: stringifyValue(beforeObj[key]), after: stringifyValue(afterObj[key]) }));
}

export default function AuditHistory({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4">
        <h2 className="font-mono text-sm font-semibold text-foreground">History</h2>
        <p className="mt-2 text-xs text-muted">No history recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h2 className="font-mono text-sm font-semibold text-foreground">History</h2>
      <div className="mt-3 flex flex-col gap-3">
        {logs.map((log) => {
          const changes = diffFields(log.before, log.after);
          return (
            <div key={log.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                  {log.action}
                </span>
                <span className="text-[11px] text-muted">
                  {log.actor?.name ?? log.actor?.email ?? "System"} · {formatDate(log.at)}
                </span>
              </div>
              {changes.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {changes.map((change) => (
                    <li key={change.field} className="text-[11px] text-muted">
                      <span className="font-mono text-foreground">{change.field}</span>: {change.before} → {change.after}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
