import Link from "next/link";

export default function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = "View all →",
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
      <div>
        <h2 className="font-mono text-lg font-semibold text-foreground">{title}</h2>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {viewAllHref ? (
        <Link href={viewAllHref} className="hidden text-xs text-muted transition-colors hover:text-accent sm:inline">
          {viewAllLabel}
        </Link>
      ) : null}
    </div>
  );
}
