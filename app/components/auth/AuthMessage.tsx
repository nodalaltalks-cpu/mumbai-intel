export function AuthError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-negative/20 bg-negative/10 px-3.5 py-2.5 text-sm text-negative">{message}</div>;
}

export function AuthSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-positive/20 bg-positive/10 px-3.5 py-2.5 text-sm text-positive">{message}</div>;
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
