"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackResearchEvent } from "@/lib/track-research";

/**
 * Wraps next/link so a "Continue Research" click fires a CONTINUE_RESEARCH_CLICKED
 * beacon before the navigation completes — the one ResearchEventType with no
 * existing server round-trip to attach to (see lib/track-research.ts).
 */
export default function ContinueResearchLink({
  href,
  entityType,
  entityId,
  className,
  children,
}: {
  href: string;
  entityType?: string;
  entityId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => trackResearchEvent("CONTINUE_RESEARCH_CLICKED", entityType, entityId)}>
      {children}
    </Link>
  );
}
