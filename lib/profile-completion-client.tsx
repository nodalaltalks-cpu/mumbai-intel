"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getSectionProgress,
  getUxMilestoneCrossed,
  UX_MILESTONE_MESSAGES,
  UX_MILESTONES,
  type CompletionSectionStatus,
  type ProfileSectionKey,
  type UxMilestone,
} from "@/lib/profile-completion-shared";

const UX_MILESTONES_DESC = [...UX_MILESTONES].reverse();
import {
  recordFieldSkippedAction,
  recordProfileStartedAction,
  recordSectionClickedAction,
  recordSectionCompletedAction,
} from "@/lib/actions/profile-analytics";

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

/** A whole section (Personal Details, Budget, ...) just transitioned incomplete -> complete, or the overall profile just reached 100% -- the two celebration moments Section 12/13 ask to distinguish. Replaces the old numeric 25/50/75/90 percent-bracket toast, which fired on arbitrary percent crossings that didn't correspond to anything the user could point to ("what did I just finish?"); a named section is more legible and matches the spec's own examples verbatim. The server-side PROFILE_COMPLETION_25/50/75/90 analytics events (fired from the save actions, unrelated to this UI trigger) are untouched. */
type Celebration =
  | { kind: "section"; section: ProfileSectionKey; label: string }
  | { kind: "milestone"; percent: UxMilestone; message: string }
  | { kind: "complete" };

interface ProfileCompletionContextValue {
  sections: CompletionSectionStatus[];
  percent: number;
  guidedActive: boolean;
  celebration: Celebration | null;
  dismissCelebration: () => void;
  /** Optimistically flips a field's local status the instant the user acts — the real persisted value still comes from the server action running in parallel; this is purely so the visible % and checklist never wait on a round trip. */
  setFieldComplete: (key: string, complete: boolean) => void;
  /** Current complete/incomplete state of one field, read BEFORE a caller's own optimistic setFieldComplete call — lets a card tell "this field just became complete for the first time" apart from "already complete, just being edited/adjusted," so it only auto-advances on a genuine transition (Section 12/18/19). */
  isFieldComplete: (key: string) => boolean;
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
 * Focuses `focusTarget` only once the smooth scroll actually finishes,
 * rather than guessing a fixed delay. A fixed delay (previously 500ms) was
 * live-verified to fail intermittently: scroll distance to the target varies
 * a lot (a field near the top of Personal Details vs. Family Income near the
 * bottom of the page), and smooth-scroll duration scales with distance --
 * 500ms was enough for a ~1300px scroll but not for a ~1750px one, so focus
 * fired mid-animation and the viewport never finished moving. `scrollend`
 * fires exactly when the browser's own scroll animation completes, so this
 * works regardless of distance; the timeout is only a safety net for
 * browsers without `scrollend` support (pre-17.4 Safari) or the rare case
 * where no actual scrolling was needed (target already in view).
 */
function focusAfterScroll(focusTarget: HTMLElement) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    focusTarget.focus({ preventScroll: true });
  };
  const supportsScrollEnd = "onscrollend" in window;
  if (supportsScrollEnd) {
    const handler = () => {
      window.removeEventListener("scrollend", handler);
      finish();
    };
    window.addEventListener("scrollend", handler);
  }
  window.setTimeout(finish, supportsScrollEnd ? 1500 : 900); // safety net if scrollend never fires, or fixed fallback pre-Safari-17.4
}

/**
 * Chromium suspends the rAF-driven animation behind `scrollIntoView({behavior:
 * "smooth"})` while the page is not visible/foregrounded (`document.hidden`)
 * -- the call returns immediately but the viewport never actually moves,
 * silently. That's not just a background-tab edge case: a notification link
 * opened in a new background tab, or a window that's minimized/occluded the
 * instant the guided-scroll effect fires on page load, hits this exact same
 * silent no-op (live-verified: scrollY stayed put for 3+ seconds under
 * `document.visibilityState === "hidden"`, vs. an identical `behavior:
 * "instant"` call landing correctly). This checks whether the smooth call
 * actually made progress shortly after, and if not, re-issues it as an
 * instant jump so the destination is still reached either way. Guarded by
 * `token` against `activeNavigationToken` (see below) so this delayed retry
 * silently no-ops if a NEWER navigation has since started -- otherwise this
 * exact mechanism, meant to fix one jump, could itself cause a different one
 * by re-scrolling to a now-stale destination.
 */
function scrollIntoViewRobust(el: HTMLElement, block: ScrollLogicalPosition, token: number) {
  const before = window.scrollY;
  el.scrollIntoView({ behavior: "smooth", block });
  window.setTimeout(() => {
    if (token !== activeNavigationToken) return; // superseded by a newer navigation while we were waiting
    if (window.scrollY !== before) return; // smooth animation is progressing (or already finished) -- nothing to do
    const rect = el.getBoundingClientRect();
    const stillOffscreen = rect.top < 0 || rect.bottom > window.innerHeight;
    if (stillOffscreen) el.scrollIntoView({ behavior: "instant", block });
  }, 400);
}

/**
 * Monotonic token identifying the current in-flight guided-navigation
 * request. Every entry point (scrollToFirstIncomplete, scrollToSection,
 * scrollToField, scrollToNextAfter, the notification-deep-link effect)
 * mints a new token via `scrollToAnchor` before doing anything async --
 * anything checking against a stale token silently abandons its work
 * instead of scrolling. This is what "avoid multiple competing scroll
 * operations" (Part 7) actually means in practice: not just avoiding two
 * scrollIntoView calls back to back, but making sure a slow, still-pending
 * older request (waiting on the DOM/page to settle) can never fire AFTER a
 * newer, more relevant one already has -- which is what produced the
 * "jumps up/down before reaching destination" symptom: two different
 * navigation requests both eventually scrolling, to two different places,
 * moments apart.
 */
let activeNavigationToken = 0;

/**
 * Polls (via requestAnimationFrame, not a guessed setTimeout delay) until
 * `get` returns an element, then resolves one frame later so that element's
 * own layout has settled. Resolves `null` if superseded by a newer
 * navigation, or if the element never appears within `timeoutMs` (a safety
 * ceiling, not the mechanism itself -- every profile section is already
 * present in the initial server-rendered HTML, so this should resolve on
 * the very first frame in practice; the ceiling only protects against a
 * genuinely missing id).
 */
function waitForElement(get: () => HTMLElement | null, token: number, timeoutMs = 4000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs;
    function tick() {
      if (token !== activeNavigationToken) return resolve(null);
      const el = get();
      if (el) return requestAnimationFrame(() => resolve(el));
      if (performance.now() >= deadline) return resolve(null);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/**
 * Waits for the document's own resources (images in particular -- the
 * user's avatar, referral-card icons) to finish loading, so the scroll
 * destination is measured against a layout that's actually done shifting,
 * not a moment before an image loads in and pushes everything below it
 * down. Deterministic (driven by `document.readyState`, not a guessed
 * delay) with a bounded ceiling so a single slow/failed resource can't hang
 * navigation indefinitely.
 */
function waitForPageSettled(token: number, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === "complete") return resolve();
    const deadline = performance.now() + timeoutMs;
    function tick() {
      if (token !== activeNavigationToken || document.readyState === "complete" || performance.now() >= deadline) return resolve();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/**
 * The single async worker behind every guided-navigation entry point.
 * Prefers the field's own control (id="field-<key>", set on the specific
 * input/button that field actually saves through) so guided mode lands on
 * the right control even when a section has several fields (e.g. Personal
 * Details has Verify-email/Name/Phone, Property Type has category/
 * configuration) — falling back to "first focusable in the section" only
 * for fields that don't tag a specific control yet. Scrolls EXACTLY ONCE
 * per navigation (plus the narrow hidden-tab retry above, itself
 * token-guarded), only after the destination genuinely exists and the page
 * has stopped shifting under it.
 */
async function navigateToAnchor(anchorId: string, fieldKey: string | undefined, token: number) {
  const fieldId = fieldKey ? `field-${fieldKey}` : null;
  const el = await waitForElement(() => (fieldId ? document.getElementById(fieldId) : null) ?? document.getElementById(anchorId), token);
  if (!el || token !== activeNavigationToken) return;

  await waitForPageSettled(token);
  if (token !== activeNavigationToken) return; // a newer navigation started while we waited for the page to settle

  const isFieldTarget = fieldId !== null && el.id === fieldId;
  scrollIntoViewRobust(el, isFieldTarget ? "center" : "start", token);
  if (isFieldTarget) {
    focusAfterScroll(el);
  } else {
    const focusable = el.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]");
    if (focusable) focusAfterScroll(focusable);
  }
}

/** Mints a fresh navigation token (superseding any in-flight older request) and kicks off the async worker. Synchronous from callers' perspective, same as before. */
function scrollToAnchor(anchorId: string, fieldKey?: string): number {
  const token = ++activeNavigationToken;
  void navigateToAnchor(anchorId, fieldKey, token);
  return token;
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
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const abandonedFiredRef = useRef(false);

  useEffect(() => {
    console.log("[mi-debug] Provider mounted", { initialPercent });
    return () => console.log("[mi-debug] Provider UNMOUNTED");
  }, []);

  const percent = useMemo(() => {
    const complete = sections.filter((s) => s.complete).length;
    return sections.length ? Math.round((complete / sections.length) * 100) : 0;
  }, [sections]);

  // Per-section completion tracking (Section 12) — a ref, not localStorage:
  // seeded from the sections the page actually loaded with, so a section
  // that's already complete on arrival never "celebrates" itself, and a
  // section only celebrates once per session the instant it genuinely
  // transitions incomplete -> complete (never on a mere revisit or a further
  // edit to an already-complete section, since neither changes isComplete).
  const prevSectionCompleteRef = useRef<Partial<Record<ProfileSectionKey, boolean>>>(
    Object.fromEntries(getSectionProgress(initialSections).map((sp) => [sp.section, sp.totalCount > 0 && sp.completeCount === sp.totalCount]))
  );

  // 100% is its own distinct, largest celebration (Part 4) — self-seeding ref
  // so a profile that's already 100% on load never re-celebrates.
  const celebratedCompleteRef = useRef(initialPercent >= 100);

  // Phase 3C Part 2/3 — 20/40/60/80/90 UX milestones, tracked as "highest
  // bracket already celebrated" (not a per-bracket boolean set) so a profile
  // that loads at, say, 65% never retroactively celebrates 20/40/60 on
  // mount, and a later save that jumps straight from 55% to 85% still only
  // celebrates once (the highest bracket crossed), matching
  // getUxMilestoneCrossed's own "highest crossed" semantics.
  const highestUxMilestoneCelebratedRef = useRef<number>(
    [...UX_MILESTONES_DESC].find((m) => initialPercent >= m) ?? 0
  );

  const prevPercentRef = useRef(initialPercent);
  useEffect(() => {
    console.log("[mi-debug] effect run", { prevPercent: prevPercentRef.current, percent, highest: highestUxMilestoneCelebratedRef.current });
    // Priority: 100% completion > a percent milestone > a single section
    // completing — at most ONE celebration per state update, so a save that
    // both finishes a section AND crosses a milestone never stacks two
    // popups. A section-complete that does NOT coincide with a fresh
    // milestone still gets its own (smaller) toast, unchanged from before.
    if (percent >= 100 && !celebratedCompleteRef.current) {
      celebratedCompleteRef.current = true;
      setCelebration({ kind: "complete" });
      prevPercentRef.current = percent;
      return;
    }

    const uxCrossed = getUxMilestoneCrossed(prevPercentRef.current, percent);
    prevPercentRef.current = percent;
    if (uxCrossed !== null && uxCrossed > highestUxMilestoneCelebratedRef.current) {
      console.log("[mi-debug] setting milestone celebration", uxCrossed);
      highestUxMilestoneCelebratedRef.current = uxCrossed;
      setCelebration({ kind: "milestone", percent: uxCrossed, message: UX_MILESTONE_MESSAGES[uxCrossed] });
      // Still record section-completion transitions for the analytics side
      // effect (recordSectionCompletedAction) even though the UI shows the
      // milestone popup instead of the section one this time.
      for (const sp of getSectionProgress(sections)) {
        const isComplete = sp.totalCount > 0 && sp.completeCount === sp.totalCount;
        const wasComplete = prevSectionCompleteRef.current[sp.section] ?? false;
        prevSectionCompleteRef.current[sp.section] = isComplete;
        if (isComplete && !wasComplete) void recordSectionCompletedAction(sp.section);
      }
      return;
    }

    for (const sp of getSectionProgress(sections)) {
      const isComplete = sp.totalCount > 0 && sp.completeCount === sp.totalCount;
      const wasComplete = prevSectionCompleteRef.current[sp.section] ?? false;
      prevSectionCompleteRef.current[sp.section] = isComplete;
      if (isComplete && !wasComplete) {
        void recordSectionCompletedAction(sp.section);
        setCelebration({ kind: "section", section: sp.section, label: sp.label });
        break; // one celebration at a time even if two sections complete in the same update
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs intentionally excluded; this must only re-run when sections/percent actually change
  }, [sections, percent]);

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

  const isFieldComplete = useCallback((key: string) => sections.find((s) => s.key === key)?.complete ?? false, [sections]);

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
    (key: string, force = false) => {
      // The auto-advance-after-save case (ProfileForm's persist(), called on
      // every field that just transitioned complete) stays gated behind
      // guidedActive -- a user quietly filling in fields in their own order,
      // who never asked to be guided, shouldn't get an unsolicited jump.
      // `force` (skipField below) bypasses that gate: an explicit "Skip for
      // now" click IS the user asking to move on, and doing nothing in
      // response is a dead end, not a safe default.
      if (!guidedActive && !force) return;
      const idx = sections.findIndex((s) => s.key === key);
      const rest = idx >= 0 ? sections.slice(idx + 1) : sections;
      const next = rest.find((s) => !s.complete) ?? sections.find((s) => !s.complete);
      const anchor = next ? FIELD_ANCHORS[next.key] : null;
      if (anchor && next && next.key !== key) {
        void recordSectionClickedAction({ section: next.section, field: next.key, trigger: "auto_advance" });
        // Deliberate brief pause so the "Saved" micro-feedback is visible
        // before auto-advancing -- UX pacing, not a render/data wait (the
        // destination is already in the DOM). Snapshotting the token here
        // means that if the user (or any other trigger) starts a DIFFERENT
        // navigation in the meantime, this stale auto-advance silently
        // stands down instead of yanking them away from wherever they went
        // -- exactly the "must not jump to unrelated sections" requirement.
        const snapshotToken = activeNavigationToken;
        window.setTimeout(() => {
          if (activeNavigationToken !== snapshotToken) return;
          scrollToAnchor(anchor, next.key);
        }, 550);
      }
    },
    [guidedActive, sections]
  );

  const skipField = useCallback(
    (key: string) => {
      void recordFieldSkippedAction(key);
      setGuidedActive(true); // an explicit Skip is itself entering guided mode, same as the "Complete my profile" CTA -- so a save on the NEXT field also auto-advances
      scrollToNextAfter(key, true);
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
  // Part 5 (notification deep-linking) -- read once alongside guideParam, same
  // "handled" gating below, so a notification's actionUrl
  // (/account?tab=profile&guide=1&section=budget&field=...) lands on the
  // SPECIFIC section/field it was about instead of always the first
  // incomplete field overall. Absent -> unchanged existing behavior.
  const sectionParam = searchParams.get("section") as ProfileSectionKey | null;
  const fieldParam = searchParams.get("field");
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
      params.delete("section");
      params.delete("field");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (nextSearch ? `?${nextSearch}` : "") + window.location.hash);
    }
    // No arbitrary delay here: scrollToField/scrollToSection/scrollToFirstIncomplete
    // (via scrollToAnchor -> navigateToAnchor) each deterministically wait
    // for their destination element to exist and the page to finish settling
    // before scrolling, rather than guessing a fixed ms (Part 7). Deliberately
    // still no cleanup that could cancel a pending navigation on this effect's
    // own re-run -- see comment above for why (the replaceState-triggered
    // re-render must not cancel the navigation it itself is part of).
    if (fieldParam) {
      scrollToField(fieldParam, "notification_deep_link");
    } else if (sectionParam) {
      scrollToSection(sectionParam, "notification_deep_link");
    } else if (sections.some((s) => !s.complete)) {
      scrollToFirstIncomplete("next_action_card");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the guide param itself flips to/from "1"
  }, [guideParam]);

  const value: ProfileCompletionContextValue = {
    sections,
    percent,
    guidedActive,
    celebration,
    dismissCelebration: () => setCelebration(null),
    setFieldComplete,
    isFieldComplete,
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
