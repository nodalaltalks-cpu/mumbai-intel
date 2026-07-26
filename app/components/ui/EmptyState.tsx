export default function EmptyState({
  title,
  message,
  className = "",
}: {
  title: string;
  message?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-sm border border-border bg-surface px-8 py-12 text-center ${className}`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <span className="text-lg">ℹ️</span>
      </div>
      <p className="text-xs uppercase tracking-[0.28em] text-muted">{title}</p>
      {message ? <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">{message}</p> : null}
    </div>
  );
}
