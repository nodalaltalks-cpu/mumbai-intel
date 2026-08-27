"use client";

import { IconChevronDown } from "@/app/components/ui/icons";
import { useProfileCompletion } from "@/lib/profile-completion-client";
import { getSectionProgress, type ProfileSectionKey } from "@/lib/profile-completion-shared";

/**
 * One accordion row: a large, thumb-friendly header (title + live completion
 * status + chevron) that expands/collapses this section's existing content
 * directly beneath it — tap-to-open, tap-again-to-close, exactly one section
 * open at a time. The content is always mounted, only CSS-hidden when
 * collapsed, so no field's in-progress value or debounce timer is ever lost
 * switching sections. Every existing field/question inside `children` is
 * untouched — this only changes how the section is revealed.
 */
export default function ProfileSectionPanel({
  anchorId,
  section,
  title,
  className = "",
  children,
}: {
  anchorId: string;
  section: ProfileSectionKey;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { sections, activeAnchor, setActiveAnchor, scrollToSection } = useProfileCompletion();
  const isActive = activeAnchor === anchorId;
  const sectionProgress = getSectionProgress(sections).find((sp) => sp.section === section);
  const isComplete = Boolean(sectionProgress && sectionProgress.totalCount > 0 && sectionProgress.completeCount === sectionProgress.totalCount);
  const statusLabel = !sectionProgress || sectionProgress.totalCount === 0
    ? null
    : isComplete
      ? "✓ Complete"
      : sectionProgress.completeCount === 0
        ? "Not completed"
        : `${Math.round((sectionProgress.completeCount / sectionProgress.totalCount) * 100)}% Complete`;

  function handleToggle() {
    if (isActive) {
      setActiveAnchor(null);
    } else {
      scrollToSection(section, "accordion_header");
    }
  }

  return (
    <div id={anchorId} className={`scroll-mt-24 overflow-hidden rounded-lg border border-border bg-surface ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isActive}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-surface-raised"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-base font-semibold text-foreground">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {statusLabel ? (
            <span className={`whitespace-nowrap font-mono text-[11px] uppercase tracking-wide ${isComplete ? "text-positive" : "text-muted"}`}>
              {statusLabel}
            </span>
          ) : null}
          <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${isActive ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div className={isActive ? "block border-t border-border p-4" : "hidden"}>{children}</div>
    </div>
  );
}
