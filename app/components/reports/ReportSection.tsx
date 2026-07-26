import type { ReactNode } from "react";

/** Consistent section wrapper for report documents — id (for anchor nav), title, optional description, then content. */
export default function ReportSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32">
      <h2 className="font-mono text-lg font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}
