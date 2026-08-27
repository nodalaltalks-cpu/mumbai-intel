"use client";

import { useProfileCompletion, SECTION_ANCHORS } from "@/lib/profile-completion-client";
import { getSectionProgress, type ProfileSectionKey } from "@/lib/profile-completion-shared";

const SECTION_ORDER: ProfileSectionKey[] = ["personal", "budget", "property", "status", "purpose", "location", "family"];

const ANCHOR_TO_SECTION: Record<string, ProfileSectionKey> = Object.fromEntries(
  Object.entries(SECTION_ANCHORS).map(([section, anchor]) => [anchor, section as ProfileSectionKey])
);

/**
 * The single-screen section jump — lets the user pick any existing profile
 * section directly instead of scrolling past the others. Only ever lists the
 * sections that already exist (SECTION_ORDER mirrors PROFILE_COMPLETION_SECTIONS'
 * own section set); this never adds, removes, or renames a section. Picking
 * one expands that section's accordion panel (via scrollToSection, which
 * already sets activeAnchor) and scrolls straight to its first incomplete
 * field, reusing the exact same guided-navigation path the completion bar's
 * own section grid already uses.
 */
export default function ProfileSectionSelector() {
  const { sections, activeAnchor, scrollToSection } = useProfileCompletion();
  const sectionProgress = getSectionProgress(sections);
  const progressByKey = Object.fromEntries(sectionProgress.map((sp) => [sp.section, sp]));
  const currentSection = ANCHOR_TO_SECTION[activeAnchor] ?? "personal";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="profile-section-select" className="font-mono text-[11px] uppercase tracking-wide text-muted">
        Jump to section
      </label>
      <select
        id="profile-section-select"
        value={currentSection}
        onChange={(e) => scrollToSection(e.target.value as ProfileSectionKey, "section_selector")}
        className="w-full rounded-lg border border-accent/40 bg-surface px-3.5 py-3 text-sm font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
      >
        {SECTION_ORDER.map((section) => {
          const sp = progressByKey[section];
          const isComplete = sp && sp.totalCount > 0 && sp.completeCount === sp.totalCount;
          const status = isComplete ? "Complete" : sp ? `${sp.completeCount}/${sp.totalCount}` : "";
          return (
            <option key={section} value={section}>
              {isComplete ? "✓ " : ""}
              {sp?.label ?? section}
              {status ? ` — ${status}` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
