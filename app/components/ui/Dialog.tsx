"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Button from "@/app/components/ui/Button";
import { IconClose } from "@/app/components/ui/icons";
import { useModalBackClose } from "@/lib/use-modal-back-close";

/** Small shared overlay dialog — same fixed-overlay/Escape/focus pattern already used by ProjectCard's QuickViewModal, factored out since Contact Developer and Report Incorrect Information both need it. */
export default function Dialog({
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered below the scrollable body, outside it — stays pinned/visible without scrolling (e.g. primary actions on a long review body). Omit for the original single-region layout. */
  footer?: ReactNode;
  /** Tailwind max-width class — defaults to the original compact size; wider content (e.g. a PDF preview) can pass "max-w-3xl". */
  maxWidth?: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalBackClose(true, onClose);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="mi-fade-in fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mi-pop-in flex max-h-[calc(100vh-2rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-md border border-border bg-surface shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
          <Button ref={closeButtonRef} type="button" variant="secondary" size="sm" onClick={onClose} aria-label="Close">
            <IconClose className="h-3 w-3" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>
  );
}
