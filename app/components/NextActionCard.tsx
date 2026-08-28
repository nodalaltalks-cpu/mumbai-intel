import Link from "next/link";
import { IconChevronRightSmall } from "@/app/components/ui/icons";
import type { NextAction } from "@/lib/dashboard-next-action";

/** The dashboard's one primary CTA — rendered above the tabs, on every tab, so "what should I do next" never depends on which tab the user happens to be on. Deliberately a single compact highlighted line, not a large card/button — the destination and guided-navigation behavior (action.href, incl. the `&guide=1` auto-scroll signal) are unchanged. */
export default function NextActionCard({ action }: { action: NextAction }) {
  return (
    <Link
      href={action.href}
      className="flex items-center gap-2 self-start rounded-full border border-accent/30 bg-accent/5 py-1.5 pl-1 pr-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
    >
      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-white">
        Next step
      </span>
      <span className="truncate">{action.title}</span>
      <IconChevronRightSmall className="h-3 w-3 shrink-0" />
    </Link>
  );
}
