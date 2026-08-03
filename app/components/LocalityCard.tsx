import Image from "next/image";
import Link from "next/link";
import { formatPricePerSqft, formatSignedPercent } from "@/lib/format";
import { gated, maskPercent, maskPricePerSqft, maskScore } from "@/lib/premium/mask";

export interface LocalityCardData {
  slug: string;
  name: string;
  zoneName?: string | null;
  coverImageUrl?: string | null;
  avgPricePerSqftPaise?: number | null;
  rentalYieldPercent?: number | null;
  growthPercentYoy?: number | null;
  investmentScore?: number | null;
  projectCount: number;
  builderCount?: number;
}

/** `locked` masks avg price/sqft, YoY growth, rental yield and the investment-score badge — project/builder counts stay visible. */
export default function LocalityCard({ locality, locked = false }: { locality: LocalityCardData; locked?: boolean }) {
  return (
    <Link
      href={`/localities/${locality.slug}`}
      className="group flex flex-col overflow-hidden rounded-sm border border-border bg-surface transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-raised hover:shadow-md"
    >
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
        {locality.coverImageUrl ? (
          <Image src={locality.coverImageUrl} alt={locality.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-mono text-2xl font-bold text-border">{locality.name.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        {locality.investmentScore != null ? (
          <span className="absolute right-2 top-2 rounded-sm border border-accent/40 bg-background/80 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-accent backdrop-blur">
            Invest {gated(locked, locality.investmentScore.toFixed(1), maskScore())}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="truncate font-mono text-sm font-semibold text-foreground group-hover:text-accent">{locality.name}</h3>
          {locality.zoneName ? <p className="mt-0.5 truncate text-xs text-muted">{locality.zoneName}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Avg price</p>
            <p className="font-mono text-sm text-foreground">{gated(locked, formatPricePerSqft(locality.avgPricePerSqftPaise), maskPricePerSqft())}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted">YoY growth</p>
            <p className="font-mono text-sm text-foreground">{gated(locked, formatSignedPercent(locality.growthPercentYoy), maskPercent())}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Rental yield</p>
            <p className="font-mono text-sm text-foreground">
              {gated(locked, locality.rentalYieldPercent != null ? `${locality.rentalYieldPercent}%` : "--", maskPercent())}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted">Projects</p>
            <p className="font-mono text-sm text-foreground">
              {locality.projectCount}
              {locality.builderCount !== undefined ? <span className="text-muted"> · {locality.builderCount} builders</span> : null}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
