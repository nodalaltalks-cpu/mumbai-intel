"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CompletionSectionStatus, ProfileSectionKey } from "@/lib/profile-completion-shared";
import { recordFieldSkippedAction, recordProfileStartedAction } from "@/lib/actions/profile-analytics";

/** Where each field's card lives on the page — used both for the checklist chips and for guided auto-scroll. Keep in sync with the section ids rendered in app/account/page.tsx. */
export const FIELD_ANCHORS: Record<string, string> = {
  name: "basic-profile",
  phone: "basic-profile",
  emailVerified: "basic-profile",
  dateOfBirth: "basic-profile",
  gender: "basic-profile",
  budget: "budget",
  localities: "locations",
  category: "property-type",
  configuration: "property-type",
  readiness: "property-status",
  purpose: "purpose",
  familySize: "family",
  familyIncome: "family",
};

const MILESTONES = [25, 50, 75, 90, 100] as const;
type Milestone = (typeof MILESTONES)[number];

interface ProfileCompletionContextValue {
  sections: CompletionSectionStatus[];
  percent: number;
  guidedActive: boolean;
  celebration: Milestone | null;
  dismissCelebration: () => void;
  /** Optimistically flips a field's local status the instant the user acts — the real persisted value still comes from the server action running in parallel; this is purely so the visible % and checklist never wait on a round trip. */
  setFieldComplete: (key: string, complete: boolean) => void;
  startGuided: () => void;
  firstIncompleteAnchor: () => string | null;
  scrollToFirstIncomplete: () => void;
  scrollToNextAfter: (key: string) => void;
  skipField: (key: string) => void;
}

const ProfileCompletionContext = createContext<ProfileCompletionContextValue | null>(null);

/**
 * Scrolls to a field. Prefers the field's own control (id="field-<key>",
 * set on the specific input/button that field actually saves through) so
 * guided mode lands on the right control even when a section has several
 * fields (e.g. Personal Details has Verify-email/Name/Phone, Property Type
 * has category/configuration) — falling back to "first focusable in the
 * section" only for fields that don't tag a specific control yet.
 */
function scrollToAnchor(anchorId: string, fieldKey?: string) {
  const fieldEl = fieldKey ? document.getElementById(`field-${fieldKey}`) : null;
  if (fieldEl) {
    fieldEl.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldEl.focus({ preventScroll: true });
    return;
  }
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusable = el.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]");
  focusable?.focus({ preventScroll: true });
}

export function ProfileCompletionProvider({
  userId,
  initialSections,
  initialPercent,
  children,
}: {
  userId: string;
  initialSections: CompletionSectionStatus[];
  initialPercent: number;
  children: React.ReactNode;
}) {
  const [sections, setSections] = useState(initialSections);
  const [guidedActive, setGuidedActive] = useState(false);
  const [celebration, setCelebration] = useState<Milestone | null>(null);
  const seenMilestoneKey = `mi_profile_milestones_${userId}`;
  const lastPercentRef = useRef(initialPercent);
  const abandonedFiredRef = useRef(false);

  const percent = useMemo(() => {
    const complete = sections.filter((s) => s.complete).length;
    return sections.length ? Math.round((complete / sections.length) * 100) : 0;
  }, [sections]);

  // Fires a one-time-per-user, per-milestone celebration purely client-side
  // (localStorage dedup) — the real, authoritative PROFILE_COMPLETION_XX
  // analytics event is fired server-side in the save actions themselves
  // (lib/profile-completion.ts's getMilestoneCrossed), so this local
  // celebration never needs to be the source of truth, only the UI trigger.
  useEffect(() => {
    const before = lastPercentRef.current;
    lastPercentRef.current = percent;
    if (percent <= before) return;
    const crossed = [...MILESTONES].reverse().find((m) => before < m && percent >= m);
    if (!crossed) return;
    let seen: number[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(seenMilestoneKey) ?? "[]");
    } catch {
      seen = [];
    }
    if (seen.includes(crossed)) return;
    setCelebration(crossed);
    try {
      localStorage.setItem(seenMilestoneKey, JSON.stringify([...seen, crossed]));
    } catch {
      // best-effort only
    }
  }, [percent, seenMilestoneKey]);

  // Best-effort funnel-drop-off signal (Part 5) — fires once, the first time
  // the page is hidden (tab switch, navigation, or close) while the user is
  // mid-guided-flow and hasn't reached 100%. `visibilitychange` -> "hidden"
  // is the reliable cross-platform signal recommended over `beforeunload`
  // (which mobile Safari/Chrome frequently never fire at all); sendBeacon
  // is used specifically because a normal fetch can be cancelled by the
  // browser mid-navigation.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (abandonedFiredRef.current || !guidedActive || percent >= 100) return;
      abandonedFiredRef.current = true;
      try {
        const payload = JSON.stringify({ eventType: "PROFILE_COMPLETION_ABANDONED", entityType: "PublicUser", entityId: userId, metadata: { percent } });
        navigator.sendBeacon?.("/api/analytics/research", new Blob([payload], { type: "application/json" }));
      } catch {
        // best-effort only
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [guidedActive, percent, userId]);

  const setFieldComplete = useCallback((key: string, complete: boolean) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, complete } : s)));
  }, []);

  const firstIncompleteAnchor = useCallback((): string | null => {
    const next = sections.find((s) => !s.complete);
    return next ? FIELD_ANCHORS[next.key] ?? null : null;
  }, [sections]);

  const scrollToFirstIncomplete = useCallback(() => {
    if (!guidedActive) void recordProfileStartedAction();
    setGuidedActive(true);
    const next = sections.find((s) => !s.complete);
    const anchor = next ? FIELD_ANCHORS[next.key] : null;
    if (anchor) scrollToAnchor(anchor, next?.key);
  }, [guidedActive, sections]);

  const scrollToNextAfter = useCallback(
    (key: string) => {
      if (!guidedActive) return;
      const idx = sections.findIndex((s) => s.key === key);
      const rest = idx >= 0 ? sections.slice(idx + 1) : sections;
      const next = rest.find((s) => !s.complete) ?? sections.find((s) => !s.complete);
      const anchor = next ? FIELD_ANCHORS[next.key] : null;
      if (anchor && next && next.key !== key) {
        window.setTimeout(() => scrollToAnchor(anchor, next.key), 550); // let the "Saved" micro-feedback register before moving on
      }
    },
    [guidedActive, sections]
  );

  const skipField = useCallback(
    (key: string) => {
      void recordFieldSkippedAction(key);
      scrollToNextAfter(key);
    },
    [scrollToNextAfter]
  );

  const value: ProfileCompletionContextValue = {
    sections,
    percent,
    guidedActive,
    celebration,
    dismissCelebration: () => setCelebration(null),
    setFieldComplete,
    startGuided: () => setGuidedActive(true),
    firstIncompleteAnchor,
    scrollToFirstIncomplete,
    scrollToNextAfter,
    skipField,
  };

  return <ProfileCompletionContext.Provider value={value}>{children}</ProfileCompletionContext.Provider>;
}

export function useProfileCompletion(): ProfileCompletionContextValue {
  const ctx = useContext(ProfileCompletionContext);
  if (!ctx) throw new Error("useProfileCompletion must be used within ProfileCompletionProvider");
  return ctx;
}

export function useSectionKeys(section: ProfileSectionKey): string[] {
  const { sections } = useProfileCompletion();
  return sections.filter((s) => s.section === section).map((s) => s.key);
}
