import type { DashboardNextActionSignals } from "@/lib/queries/dashboard";

export interface NextAction {
  key: string;
  title: string;
  message: string;
  ctaLabel: string;
  href: string;
}

/**
 * The dashboard's single primary CTA ("what should I do next") — a pure
 * function over cheap, already-fetched signals, deliberately checked in this
 * priority order so exactly one action ever shows (never competing CTAs).
 * Every branch corresponds to real platform functionality, nothing implied
 * that doesn't exist.
 */
export function resolveNextAction(input: { profileCompletionPercent: number } & DashboardNextActionSignals): NextAction | null {
  if (input.profileCompletionPercent < 50) {
    return {
      key: "complete_profile",
      title: "Complete your research profile",
      message: "Tell us your budget, locations and property type — it takes about a minute and makes every recommendation more relevant.",
      ctaLabel: "Complete my profile",
      href: "/account?tab=profile",
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
