"use client";

import ProjectCard, { type ProjectCardData } from "@/app/components/ProjectCard";
import { recordRecommendationClickAction } from "@/lib/actions/recommendations";

export interface RecommendationCardItem {
  projectId: string;
  project: ProjectCardData;
  reasonLabel: string;
}

/** Client half of every recommendation surface — the only part that needs to fire a click-tracking Server Action on navigation (Part 15/16). */
export default function RecommendationGrid({ items, surface }: { items: RecommendationCardItem[]; surface: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, position) => (
        <div key={item.project.slug} className="flex flex-col gap-1.5">
          <ProjectCard project={item.project} onNavigate={() => recordRecommendationClickAction(item.projectId, surface, position)} />
          {/* Part 16 — a short, human reason, never AI/ML jargon. */}
          <p className="px-0.5 text-[11px] text-muted">{item.reasonLabel}</p>
        </div>
      ))}
    </div>
  );
}
