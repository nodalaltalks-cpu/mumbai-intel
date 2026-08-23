import Button from "@/app/components/ui/Button";

export default function EmptyState({
  title,
  message,
  className = "",
  cta,
}: {
  title: string;
  message?: string;
  className?: string;
  /** Optional CTA button — most call sites don't need one, so this stays optional rather than forcing every empty state to have a button. */
  cta?: { label: string; href: string };
}) {
  return (
    <div className={`rounded-sm border border-border bg-surface px-8 py-12 text-center ${className}`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <span className="text-lg">ℹ️</span>
      </div>
      <p className="text-xs uppercase tracking-[0.28em] text-muted">{title}</p>
      {message ? <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">{message}</p> : null}
      {cta ? (
        <div className="mt-4">
          <Button href={cta.href} variant="ghost" size="sm">
            {cta.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
