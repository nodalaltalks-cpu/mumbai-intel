"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toggleSavedProjectAction } from "@/lib/actions/saved-projects";
import { usePremiumGate } from "@/lib/premium/gate-context";
import { trackSavedProject } from "@/lib/analytics/ga";

const RESUME_PARAM = "resumeSave";

export default function SaveProjectButton({ projectId, initialSaved }: { projectId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumedRef = useRef(false);
  const { openGate } = usePremiumGate();

  function toggle() {
    startTransition(async () => {
      const result = await toggleSavedProjectAction(projectId);
      if (result.error) {
        openGate("wishlist", buildNext());
        return;
      }
      setSaved(result.saved);
      if (result.saved) trackSavedProject(projectId);
    });
  }

  // Auto-completes the save once, right after landing back here signed-in —
  // the redirect target set below encodes exactly which project to resume.
  useEffect(() => {
    if (resumedRef.current) return;
    const marker = searchParams.get(RESUME_PARAM);
    if (marker !== projectId || saved) return;
    resumedRef.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete(RESUME_PARAM);
    const nextQs = next.toString();
    router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });

    startTransition(async () => {
      const result = await toggleSavedProjectAction(projectId);
      if (!result.error) setSaved(result.saved);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildNext(): string {
    const next = new URLSearchParams(searchParams);
    next.set(RESUME_PARAM, projectId);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        className={`rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors disabled:opacity-60 ${
          saved ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
