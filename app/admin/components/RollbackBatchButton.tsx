"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { rollbackBatchAction } from "@/lib/actions/ingestion";

/**
 * Same confirm-then-fire shape as ConfirmButton, but rollbackBatchAction
 * returns a real summary (rolledBack/needsManualReview counts) worth
 * showing rather than just refreshing silently — a non-technical founder
 * needs to see exactly what happened, not just that a button was clicked.
 */
export default function RollbackBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

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
    setMessage(null);
    if (!confirming) {
      setConfirming(true);
      timeoutRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    startTransition(async () => {
      const result = await rollbackBatchAction(batchId);
      setConfirming(false);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setIsError(false);
      setMessage(
        `${result.rolledBack ?? 0} record${result.rolledBack === 1 ? "" : "s"} rolled back to Trash.` +
          (result.needsManualReview ? ` ${result.needsManualReview} need manual review.` : "")
      );
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
          confirming ? "border-negative bg-negative/10 text-negative" : "border-border text-muted hover:border-negative hover:text-negative"
        }`}
      >
        {isPending ? "Rolling back..." : confirming ? "Confirm rollback?" : "Roll back"}
      </button>
      {message ? <span className={`max-w-[220px] text-right text-[10px] ${isError ? "text-negative" : "text-positive"}`}>{message}</span> : null}
    </div>
  );
}
