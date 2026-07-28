"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Button from "@/app/components/ui/Button";
import { IconClose } from "@/app/components/ui/icons";

/** Small shared overlay dialog — same fixed-overlay/Escape/focus pattern already used by ProjectCard's QuickViewModal, factored out since Contact Developer and Report Incorrect Information both need it. */
export default function Dialog({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class — defaults to the original compact size; wider content (e.g. a PDF preview) can pass "max-w-3xl". */
  maxWidth?: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
        className={`mi-pop-in w-full ${maxWidth} overflow-hidden rounded-md border border-border bg-surface shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
          <Button ref={closeButtonRef} type="button" variant="secondary" size="sm" onClick={onClose} aria-label="Close">
            <IconClose className="h-3 w-3" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
