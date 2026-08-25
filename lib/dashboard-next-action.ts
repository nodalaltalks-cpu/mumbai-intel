import type { DashboardNextActionSignals } from "@/lib/queries/dashboard";

export interface NextAction {
  key: string;
  title: string;
  message: string;
  ctaLabel: string;
  href: string;
}

/**
 * Indirect, percent-aware motivation (Section 10) rather than one repeated
 * "COMPLETE YOUR PROFILE" line everywhere — the message changes with how far
 * along the visitor already is, framed as a benefit rather than a chore.
 */
function profileMessageFor(percent: number): string {
  if (percent === 0) return "Add a few preferences and we'll make your property research more relevant.";
  if (percent < 50) return "You're getting closer. Your preferences are helping us understand what you're actually looking for.";
  if (percent < 90) return "Almost there. A few more details can make your recommendations much more relevant.";
  return "You're almost done. Complete the last few details to unlock your full research profile.";
}

/**
 * The dashboard's single primary CTA ("what should I do next") — a pure
 * function over cheap, already-fetched signals, deliberately checked in this
 * priority order so exactly one action ever shows (never competing CTAs).
 * Every branch corresponds to real platform functionality, nothing implied
 * that doesn't exist.
 *
 * Profile completion stays the primary action for the *entire* incomplete
 * range (0-99%), not just below some early threshold — Section 5's explicit
 * "must remain visible until completion" requirement — with the message
 * varying by percent (above) so it never reads as the same nag twice.
 * `&guide=1` is the cross-page signal ProfileCompletionProvider watches for
 * to auto-scroll to the first incomplete field on arrival (Section 1/14).
 */
export function resolveNextAction(input: { profileCompletionPercent: number } & DashboardNextActionSignals): NextAction | null {
  if (input.profileCompletionPercent < 100) {
    const percent = input.profileCompletionPercent;
    return {
      key: "complete_profile",
      title: percent === 0 ? "Complete your research profile" : `Your research profile is ${percent}% complete`,
      message: profileMessageFor(percent),
      ctaLabel: "Complete my profile",
      href: "/account?tab=profile&guide=1",
    };
  }

  if (input.savedProjectsCount === 0 && input.recentViewsCount === 0 && input.savedSearchesCount === 0) {
    return {
      key: "start_research",
      title: "Start your property research",
      message: "Explore projects, compare options and save what you like — we'll keep your research history here.",
      ctaLabel: "Explore projects",
      href: "/projects",
    };
  }

  if (input.savedProjectsCount === 0) {
    return {
      key: "save_a_project",
      title: "Save a project you're researching",
      message: "Tap Save on any project page to keep it here and compare it against others later.",
      ctaLabel: "Browse projects",
      href: "/projects",
    };
  }

  if (input.savedProjectsCount > 0) {
    return {
      key: "continue_research",
      title: "Continue researching your saved projects",
      message: "Pick up where you left off with the projects you've already saved.",
      ctaLabel: "View saved projects",
      href: "/account?tab=wishlist",
    };
  }

  return null;
}
