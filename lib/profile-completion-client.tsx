"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CompletionSectionStatus, ProfileSectionKey } from "@/lib/profile-completion-shared";
import { recordFieldSkippedAction, recordProfileStartedAction, recordSectionClickedAction } from "@/lib/actions/profile-analytics";

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
  scrollToFirstIncomplete: (source?: string) => void;
  scrollToNextAfter: (key: string) => void;
  skipField: (key: string) => void;
  /** Jumps to a whole section — its first incomplete field if one exists, otherwise just the section itself (still useful navigation for an already-complete section). */
  scrollToSection: (section: ProfileSectionKey, source?: string) => void;
  /** Jumps to one specific field by key (e.g. a single "What's left" row) — used when exactly one thing remains, or the user picks a specific item rather than "the first incomplete one." */
  scrollToField: (key: string, source?: string) => void;
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
    // Calling focus() right after starting a smooth scrollIntoView aborts the
    // in-progress scroll animation in Chromium even with preventScroll:true
    // (live-verified: focus landed on the field correctly but the viewport
    // never visibly moved) -- give the animation time to actually finish
    // before moving focus onto the target.
    window.setTimeout(() => fieldEl.focus({ preventScroll: true }), 500);
    return;
  }
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusable = el.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]");
  if (focusable) window.setTimeout(() => focusable.focus({ preventScroll: true }), 500);
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

  const scrollToFirstIncomplete = useCallback(
    (source = "completion_bar") => {
      if (!guidedActive) void recordProfileStartedAction(percent > 0);
      setGuidedActive(true);
      void recordSectionClickedAction({ trigger: "cta", source });
      const next = sections.find((s) => !s.complete);
      const anchor = next ? FIELD_ANCHORS[next.key] : null;
      if (anchor) scrollToAnchor(anchor, next?.key);
    },
    [guidedActive, sections, percent]
  );

  const scrollToSection = useCallback(
    (section: ProfileSectionKey, source = "section_row") => {
      void recordSectionClickedAction({ section, trigger: "click", source });
      const firstIncompleteInSection = sections.find((s) => s.section === section && !s.complete);
      if (firstIncompleteInSection) {
        const anchor = FIELD_ANCHORS[firstIncompleteInSection.key];
        if (anchor) scrollToAnchor(anchor, firstIncompleteInSection.key);
        return;
      }
      // Section already complete -- still navigate there via its first field's anchor.
      const anyInSection = sections.find((s) => s.section === section);
      const anchor = anyInSection ? FIELD_ANCHORS[anyInSection.key] : null;
      if (anchor) scrollToAnchor(anchor);
    },
    [sections]
  );

  const scrollToField = useCallback(
    (key: string, source = "whats_left_row") => {
      void recordSectionClickedAction({ field: key, trigger: "click", source });
      const anchor = FIELD_ANCHORS[key];
      if (anchor) scrollToAnchor(anchor, key);
    },
    []
  );

  const scrollToNextAfter = useCallback(
    (key: string) => {
      if (!guidedActive) return;
      const idx = sections.findIndex((s) => s.key === key);
      const rest = idx >= 0 ? sections.slice(idx + 1) : sections;
      const next = rest.find((s) => !s.complete) ?? sections.find((s) => !s.complete);
      const anchor = next ? FIELD_ANCHORS[next.key] : null;
      if (anchor && next && next.key !== key) {
        void recordSectionClickedAction({ section: next.section, field: next.key, trigger: "auto_advance" });
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

  // Cross-page arrival signal (Part 1's critical fix): a CTA rendered on a
  // *different* tab (the dashboard's NextActionCard, on Continue Research/
  // Wishlist/Saved Searches) can't call scrollToFirstIncomplete() directly —
  // there's no shared React tree between that tab and this one. It instead
  // links to /account?tab=profile&guide=1. Tab switches on this page are
  // same-route client-side navigations (a <Link> changing only the search
  // params), so ProfileCompletionProvider is NOT remounted when the user
  // arrives here from another tab -- a plain mount-only effect (`useEffect(
  // ..., [])`) would only ever fire once, on the account page's very first
  // load, and silently miss every later arrival via this CTA. Watching
  // Next's reactive useSearchParams() instead of a one-shot window.location
  // read is what makes this fire on every arrival, not just the first.
  //
  // The param is stripped via a plain history.replaceState, deliberately NOT
  // router.replace(): this page is `export const dynamic = "force-dynamic"`,
  // so a real router navigation re-fetches the route from the server even
  // for a searchParams-only change, and that round-trip's DOM patch was
  // observed (live-tested) to reset window.scrollY back to 0 shortly after
  // the guided scroll ran, undoing it. history.replaceState only rewrites
  // the address bar -- no server round-trip, no re-render, nothing to race.
  //
  // In this project's Next.js version, history.replaceState IS synced back
  // into useSearchParams() (confirmed against node_modules/next/dist/docs --
  // this differs from older Next.js, where it was not). That means the
  // replaceState call above itself flips guideParam from "1" back to null on
  // a follow-up render. With a plain `useEffect(..., [guideParam])` that
  // returns `() => clearTimeout(t)`, that follow-up render's cleanup fires
  // BEFORE the scheduled scroll ever runs, silently cancelling it every time
  // (live-verified: the URL correctly loses ?guide=1, but the page never
  // scrolls). guideHandledRef decouples "detected a genuine new arrival"
  // from "guideParam's current value", so the scheduled scroll is never
  // cancelled by our own replaceState call, while a real new arrival
  // (guideParam genuinely returning to "1" later) still works, because the
  // ref is reset the moment guideParam is next seen as anything other than "1".
  const searchParams = useSearchParams();
  const guideParam = searchParams.get("guide");
  const guideHandledRef = useRef(false);
  useEffect(() => {
    if (guideParam !== "1") {
      guideHandledRef.current = false;
      return;
    }
    if (guideHandledRef.current) return;
    guideHandledRef.current = true;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("guide");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (nextSearch ? `?${nextSearch}` : "") + window.location.hash);
    }
    // Small delay: lets the tab's own content (images, lazy sections) settle
    // before measuring scroll position, and matches the "Saved" micro-feedback
    // timing used elsewhere in this same guided flow. Deliberately no cleanup
    // that cancels this timeout -- see comment above for why.
    window.setTimeout(() => {
      if (sections.some((s) => !s.complete)) scrollToFirstIncomplete("next_action_card");
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the guide param itself flips to/from "1"
  }, [guideParam]);

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
    scrollToSection,
    scrollToField,
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
