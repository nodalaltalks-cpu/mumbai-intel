"use client";

import { useProfileCompletion } from "@/lib/profile-completion-client";

/**
 * One accordion panel — exactly one of these is visible at a time (whichever
 * matches ProfileCompletionProvider's activeAnchor), the rest are CSS-hidden
 * rather than unmounted. Never unmounting is what keeps every field's local
 * state, in-flight debounce timer, and auto-save behavior completely
 * untouched when the user switches sections — nothing here changes what a
 * section actually renders, only whether it's currently shown.
 */
export default function ProfileSectionPanel({
  anchorId,
  className = "",
  children,
}: {
  anchorId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { activeAnchor } = useProfileCompletion();
  const isActive = activeAnchor === anchorId;

  return (
    <div id={anchorId} className={`scroll-mt-24 ${isActive ? "block" : "hidden"} ${className}`}>
      {children}
    </div>
  );
}
