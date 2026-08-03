import { maskScore } from "@/lib/premium/mask";
import type { DeveloperMapMarker } from "@/lib/map/types";

export default function DeveloperPopup({ marker }: { marker: DeveloperMapMarker }) {
  const ratingSuffix = marker.locked
    ? ` · rating ${maskScore()}`
    : marker.overallScore !== null
      ? ` · rating ${marker.overallScore.toFixed(1)}/10`
      : "";
  return (
    <div className="flex w-60 flex-col gap-2 p-1 font-sans">
      <h3 className="font-mono text-sm font-semibold text-foreground">{marker.name}</h3>
      <p className="text-[11px] text-muted" title={marker.locked ? "🔒 Sign in to unlock verified intelligence" : undefined}>
        {marker.projectCount} project{marker.projectCount === 1 ? "" : "s"} in this area{ratingSuffix}
      </p>
      <p className="text-[9px] text-muted">Position approximates this developer&apos;s active project locations.</p>

      <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
        <a href={`/builders/${marker.slug}`} className="rounded-sm bg-accent px-2 py-1.5 text-center font-mono uppercase tracking-wide text-white hover:bg-accent-dim">
          Open Developer
        </a>
        <a href={`/reports/developers/${marker.slug}`} className="rounded-sm border border-border px-2 py-1.5 text-center font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent">
          Report
        </a>
      </div>
    </div>
  );
}
