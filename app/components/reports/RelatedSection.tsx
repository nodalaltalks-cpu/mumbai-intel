import type { ReactNode } from "react";

/** Heading + grid-or-empty-state wrapper — collapses the repeated "if items.length > 0 grid else message" pattern used by every report's Related sections. */
export default function RelatedSection({
  id,
  title,
  isEmpty,
  emptyMessage,
  children,
}: {
  id?: string;
  title: string;
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <h2 className="font-mono text-lg font-semibold text-foreground">{title}</h2>
      {isEmpty ? (
        <p className="mt-3 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      )}
    </div>
  );
}
