"use client";

import { useId, useRef, useState } from "react";
import { IconInfo } from "./icons";

/**
 * Lightweight info-icon + popover — not a modal, doesn't navigate. Opens on
 * hover, focus (keyboard-reachable via Tab), or tap; closes on Escape,
 * blur, or outside click.
 */
export default function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

  function close() {
    setOpen(false);
  }

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={panelId}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent"
      >
        <IconInfo className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          id={panelId}
          role="tooltip"
          className="mi-fade-in absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-sm border border-border bg-surface p-2 text-[10px] leading-relaxed text-muted shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
