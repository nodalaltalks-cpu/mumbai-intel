"use client";

import { useProfileCompletion } from "@/lib/profile-completion-client";

/** Only rendered while the user is in guided completion (clicked "Complete My Profile") — casual browsing of the profile stays uncluttered. Never marks the field complete; just moves on and remembers nothing was forced. */
export default function SkipFieldButton({ fieldKey }: { fieldKey: string }) {
  const { guidedActive, sections, skipField } = useProfileCompletion();
  const field = sections.find((s) => s.key === fieldKey);
  if (!guidedActive || !field || field.complete) return null;

  return (
    <button
      type="button"
      onClick={() => skipField(fieldKey)}
      className="text-[11px] font-mono uppercase tracking-wide text-muted hover:text-accent"
    >
      Skip for now
    </button>
  );
}
