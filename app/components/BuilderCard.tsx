import Image from "next/image";
import Link from "next/link";
import { formatPaise } from "@/lib/format";
import { gated, maskScore } from "@/lib/premium/mask";

export interface BuilderCardData {
  slug: string;
  name: string;
  logoUrl?: string | null;
  headquarters?: string | null;
  projectCount: number;
  deliveredCount?: number;
  underConstructionCount?: number;
  upcomingCount?: number;
  cityCount?: number;
  yearsInBusiness?: number | null;
  startingPricePaise?: number | null;
  featuredProjectName?: string | null;
  latestLaunchName?: string | null;
  overallScore?: number | null;
  investmentScore?: number | null;
}

/** `locked` masks the Rating and Investment score tiles — project counts and "Starting from" price stay visible (same asking-price data every Project Card already shows). */
export default function BuilderCard({ builder, locked = false }: { builder: BuilderCardData; locked?: boolean }) {
  const hasStatusCounts = builder.deliveredCount !== undefined || builder.underConstructionCount !== undefined || builder.upcomingCount !== undefined;

  return (
    <Link
      href={`/builders/${builder.slug}`}
      className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-raised hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {builder.logoUrl ? (
          <Image src={builder.logoUrl} alt={builder.name} width={40} height={40} className="h-10 w-10 rounded-sm border border-border object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-background">
            <span className="font-mono text-xs font-bold text-border">{builder.name.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-mono text-sm font-semibold text-foreground">{builder.name}</h3>
          <p className="truncate text-xs text-muted">
            {builder.headquarters ?? " "}
            {builder.yearsInBusiness !== undefined && builder.yearsInBusiness !== null
              ? `${builder.headquarters ? " · " : ""}${builder.yearsInBusiness} yrs in business`
              : ""}
          </p>
        </div>
      </div>

      {builder.featuredProjectName ?? builder.latestLaunchName ? (
        <p className="truncate text-[11px] text-muted">
          Featured: <span className="text-foreground">{builder.featuredProjectName ?? builder.latestLaunchName}</span>
        </p>
      ) : null}

      {hasStatusCounts ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11px] text-muted sm:grid-cols-4">
          <span>
            Active <span className="font-mono text-foreground">{(builder.underConstructionCount ?? 0) + (builder.upcomingCount ?? 0)}</span>
          </span>
          <span>
            Delivered <span className="font-mono text-foreground">{builder.deliveredCount ?? 0}</span>
          </span>
          <span>
            Upcoming <span className="font-mono text-foreground">{builder.upcomingCount ?? 0}</span>
          </span>
          {builder.cityCount !== undefined ? (
            <span>
              Cities <span className="font-mono text-foreground">{builder.cityCount}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {builder.startingPricePaise !== undefined && builder.startingPricePaise !== null ? (
        <p className="text-[11px] text-muted">
          Starting from <span className="font-mono text-foreground">{formatPaise(builder.startingPricePaise)}</span>
        </p>
      ) : null}

      <div className="mt-auto flex items-end justify-between border-t border-border pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Rating</p>
          <p className="font-mono text-sm text-foreground" title={locked ? "🔒 Sign in to unlock verified intelligence" : undefined}>
            {gated(locked, builder.overallScore != null ? `${builder.overallScore.toFixed(1)}/10` : "--", maskScore())}
          </p>
        </div>
        {builder.investmentScore !== undefined && builder.investmentScore !== null ? (
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted">Investment</p>
            <p className="font-mono text-sm text-accent" title={locked ? "🔒 Sign in to unlock verified intelligence" : undefined}>
              {gated(locked, `${builder.investmentScore.toFixed(1)}/10`, maskScore())}
            </p>
          </div>
        ) : null}
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted">Projects</p>
          <p className="font-mono text-sm text-foreground">{builder.projectCount}</p>
        </div>
      </div>
    </Link>
  );
}
