"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export default function ConfirmButton({
  action,
  label = "Delete",
  confirmLabel = "Confirm?",
  className = "",
}: {
  action: () => Promise<{ error?: string }>;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // While armed, clicking anywhere else on the page cancels the pending
  // confirmation instead of leaving it armed until the 3s timeout — same
  // click-anywhere-to-dismiss behavior as the topbar dropdowns.
  useEffect(() => {
    if (!confirming) return;
    function handleOutsideClick(event: MouseEvent) {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setConfirming(false);
      }
    }
    document.addEventListener("click", handleOutsideClick, true);
    return () => document.removeEventListener("click", handleOutsideClick, true);
  }, [confirming]);

  function handleClick() {
    setError(null);
    if (!confirming) {
      setConfirming(true);
      timeoutRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wide transition-colors disabled:opacity-60 ${
          confirming
            ? "border-negative bg-negative/10 text-negative"
            : "border-border text-muted hover:border-negative hover:text-negative"
        } ${className}`}
      >
        {isPending ? "Deleting..." : confirming ? confirmLabel : label}
      </button>
      {error ? <span className="max-w-[200px] text-right text-[10px] text-negative">{error}</span> : null}
    </div>
  );
}
