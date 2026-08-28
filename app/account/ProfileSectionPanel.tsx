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
  compact = false,
  className = "",
  children,
}: {
  anchorId: string;
  section: ProfileSectionKey;
  title: string;
  /** Renders as a dense grid tile when collapsed (smaller title/status text, tighter padding) and expands back to the normal spacious row when active -- lets several sections stay visible together on mobile without a long scroll, while every existing field inside `children` is untouched. Pass alongside a `grid grid-cols-2` wrapper; this component applies its own col-span so the active tile spans both columns. */
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { sections, activeAnchor, setActiveAnchor, scrollToSection } = useProfileCompletion();
  const isActive = activeAnchor === anchorId;
  const isTight = compact && !isActive;
  const sectionProgress = getSectionProgress(sections).find((sp) => sp.section === section);
  const isComplete = Boolean(sectionProgress && sectionProgress.totalCount > 0 && sectionProgress.completeCount === sectionProgress.totalCount);
  const statusLabel = !sectionProgress || sectionProgress.totalCount === 0
    ? null
    : isComplete
      ? (isTight ? "✓" : "✓ Complete")
      : sectionProgress.completeCount === 0
        ? (isTight ? null : "Not completed")
        : isTight
          ? `${Math.round((sectionProgress.completeCount / sectionProgress.totalCount) * 100)}%`
          : `${Math.round((sectionProgress.completeCount / sectionProgress.totalCount) * 100)}% Complete`;

  function handleToggle() {
    if (isActive) {
      setActiveAnchor(null);
    } else {
      scrollToSection(section, "accordion_header");
    }
  }

  return (
    <div
      id={anchorId}
      className={`scroll-mt-24 overflow-hidden rounded-lg border border-border bg-surface ${compact ? (isActive ? "col-span-2" : "col-span-1") : ""} ${className}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isActive}
        className={`flex w-full items-center justify-between gap-2 text-left active:bg-surface-raised ${isTight ? "px-3 py-3" : "px-4 py-4"}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`truncate font-semibold text-foreground ${isTight ? "text-sm" : "text-base"}`}>{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {statusLabel ? (
            <span
              className={`whitespace-nowrap font-mono uppercase tracking-wide ${isTight ? "text-[10px]" : "text-[11px]"} ${isComplete ? "text-positive" : "text-muted"}`}
            >
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
