import Button from "@/app/components/ui/Button";
import type { NextAction } from "@/lib/dashboard-next-action";

/** The dashboard's one primary CTA — rendered above the tabs, on every tab, so "what should I do next" never depends on which tab the user happens to be on. */
export default function NextActionCard({ action }: { action: NextAction }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent/30 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-wide text-accent">Next step</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{action.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{action.message}</p>
      </div>
      <Button href={action.href} variant="primary" size="md" className="shrink-0">
        {action.ctaLabel}
      </Button>
    </div>
  );
}
