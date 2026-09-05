"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import CompareToggleButton from "@/app/components/CompareToggleButton";
import BrochureDownloadLink from "@/app/components/BrochureDownloadLink";
import { IconClose } from "@/app/components/ui/icons";
import { useModalBackClose } from "@/lib/use-modal-back-close";
import { formatPossessionMonthYear, formatPriceBand, formatPriceFrom, formatPricePerSqft } from "@/lib/format";
import { maskPricePerSqft } from "@/lib/premium/mask";
import {
  CONSTRUCTION_BADGE_CLASS,
  CONSTRUCTION_BADGE_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  type DataSource,
  type PaymentPlanType,
  type ProjectStatus,
} from "@/lib/project-meta";

export type { DataSource, ProjectStatus };

export interface ProjectCardData {
  slug: string;
  name: string;
  tagline?: string | null;
  builderName?: string | null;
  builderLogoUrl?: string | null;
  localityName: string;
  zoneName?: string | null;
  status: ProjectStatus;
  configurationSummary?: string | null;
  priceMinPaise?: number | null;
  pricePerSqftPaise?: number | null;
  /** Legacy fallback only — real records created before possessionMonth/possessionYear existed. Never rendered as a quarter or a raw date, only ever reduced to month+year (see formatPossessionMonthYear). */
  possessionDate?: Date | string | null;
  constructionPercent?: number | null;
  /** India-localized possession (1–12 / e.g. 2028) — the authoritative source for display; falls back to possessionDate above only for pre-migration records. */
  possessionMonth?: number | null;
  possessionYear?: number | null;
  totalUnits?: number | null;
  totalTowers?: number | null;
  landAreaAcres?: number | null;
  paymentPlanType?: PaymentPlanType | null;
  /** Shown verbatim in the Payment Plan info tooltip — the info icon only renders when this is present. */
  paymentPlanDescription?: string | null;
  dataSource: DataSource;
  imageUrl?: string | null;
  /** Null when guest-locked (see lib/premium/mask.ts's maskProjectBrochure) — use `brochureAvailable` for the "does a brochure exist" check, never truthiness of this field, since it's intentionally null for locked guests even when a brochure exists. */
  brochureUrl?: string | null;
  brochureFileName?: string | null;
  brochureThumbnailUrl?: string | null;
  /** Always accurate regardless of lock state — safe to expose, preserves the "Download Official Brochure" affordance for guests. */
  brochureAvailable?: boolean;
  /** True when a real pricePerSqftPaise exists but was nulled out server-side for a guest (see lib/premium/mask.ts's maskProjectBrochure) — shows the masked placeholder instead of hiding the row entirely. */
  pricePerSqftMasked?: boolean;
  /** Optional — absent/null on most listing queries today, which is exactly "no floor plan uploaded" from the card's point of view (Section 34: the button simply doesn't render). Only wired where a query explicitly joins it in. */
  floorPlanUrl?: string | null;
  /** "floor_plan" (PDF, routed through the signed inline-view proxy) or "floor_plan_image" (opened directly — Cloudinary images aren't delivery-restricted). */
  floorPlanKind?: string | null;
}

/** Floor Plan's one View link (Section 34) — a PDF goes through the same signed proxy Brochure/Downloads use (raw/PDF delivery is restricted on this Cloudinary account); an image is unrestricted and opens directly. */
function floorPlanHref(url: string, kind: string | null | undefined): string {
  if (kind === "floor_plan_image") return url;
  return `/api/brochure-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent("Floor Plan.pdf")}&inline=1`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export default function ProjectCard({ project, onNavigate }: { project: ProjectCardData; onNavigate?: () => void }) {
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-sm border border-border bg-surface transition-[box-shadow,border-color] duration-150 md:hover:border-accent/40 md:hover:shadow-md">
        {/* Stretched link: an invisible full-card click target rendered as a sibling (not an ancestor) of the content below, so the Compare/Brochure/Floor Plan controls — real nested buttons — never end up inside an <a>. Non-interactive content is pointer-events-none and lets clicks fall through to this link; only actual controls opt back in with pointer-events-auto. */}
        <Link
          href={`/projects/${project.slug}`}
          aria-label={project.name}
          onClick={onNavigate}
          className="absolute inset-0 z-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />

        <div className="pointer-events-none relative z-[1] flex flex-1 flex-col">
          <div className="relative h-36 w-full shrink-0 overflow-hidden bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
            {project.imageUrl ? (
              <Image src={project.imageUrl} alt={project.name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-mono text-3xl font-bold text-border">{initials(project.name)}</span>
              </div>
            )}
            <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
              <span
                className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide backdrop-blur ${CONSTRUCTION_BADGE_CLASS[project.status]}`}
              >
                {CONSTRUCTION_BADGE_LABEL[project.status]}
              </span>
              {project.status !== "READY_TO_MOVE" && project.status !== "DELIVERED" ? (
                <span className="rounded-sm border border-border bg-background/85 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted backdrop-blur">
                  {formatPossessionMonthYear(project.possessionMonth, project.possessionYear, project.status, project.possessionDate)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              {project.builderLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.builderLogoUrl} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-sm border border-border object-cover" />
              ) : null}
              <h3 className="min-w-0 truncate font-mono text-sm font-semibold text-foreground group-hover:text-accent">
                {project.name}
              </h3>
            </div>

            <p className="truncate text-xs text-muted">
              {project.localityName}
              {project.zoneName ? ` · ${project.zoneName}` : ""}
            </p>

            {project.builderName ? <p className="truncate text-xs text-muted">{project.builderName}</p> : null}

            {project.configurationSummary ? (
              <p className="truncate text-[11px] text-muted">{project.configurationSummary}</p>
            ) : null}

            <div className="mt-auto border-t border-border pt-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted">Price From</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {formatPriceFrom(project.priceMinPaise) ?? formatPriceBand(project.priceMinPaise)}
              </p>
              {project.pricePerSqftPaise ? (
                <p className="font-mono text-[10px] text-muted">{formatPricePerSqft(project.pricePerSqftPaise)}</p>
              ) : project.pricePerSqftMasked ? (
                <p className="font-mono text-[10px] text-muted" title="🔒 Sign in to unlock verified intelligence">
                  {maskPricePerSqft()}
                </p>
              ) : null}
            </div>

            {/* Compare + Brochure live in the card body, not floating over the image —
                only these two controls opt back into pointer-events so the rest of the
                row still falls through to the full-card Link. */}
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span aria-hidden="true" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                View Project Intelligence
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
              <div className="pointer-events-auto flex items-center gap-1.5">
                <CompareToggleButton slug={project.slug} />
                {project.brochureAvailable ? (
                  <BrochureDownloadLink
                    slug={project.slug}
                    brochureUrl={project.brochureUrl ?? null}
                    brochureFileName={project.brochureFileName}
                    className="rounded-sm border border-border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                  >
                    Brochure
                  </BrochureDownloadLink>
                ) : null}
                {project.floorPlanUrl ? (
                  <a
                    href={floorPlanHref(project.floorPlanUrl, project.floorPlanKind)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-sm border border-border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
                  >
                    Floor Plan
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickViewOpen(true);
          }}
          className="absolute right-2 top-2 z-10 rounded-sm border border-border bg-background/80 px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-muted backdrop-blur transition-opacity md:opacity-0 md:hover:border-accent md:hover:text-accent md:group-hover:opacity-100"
        >
          Quick view
        </button>
      </div>

      {quickViewOpen ? <QuickViewModal project={project} onClose={() => setQuickViewOpen(false)} /> : null}
    </>
  );
}

function QuickViewModal({ project, onClose }: { project: ProjectCardData; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalBackClose(true, onClose);

  // Mount-only -- see Dialog.tsx for why this must not re-run on every
  // onClose identity change (it would yank focus back to the close button
  // on every parent re-render while the visitor is mid-interaction).
  useEffect(() => {
    closeButtonRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="mi-fade-in fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${project.name} quick view`}
        className="mi-pop-in w-full max-w-md overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-48 w-full bg-[linear-gradient(135deg,_var(--surface-raised),_var(--background))]">
          {project.imageUrl ? (
            <Image src={project.imageUrl} alt={project.name} fill sizes="(min-width: 640px) 448px, 100vw" className="object-cover" />
          ) : null}
          <Button
            ref={closeButtonRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close quick view"
            className="!bg-background/80 absolute right-2 top-2 backdrop-blur"
          >
            <IconClose className="h-3 w-3" />
            Close
          </Button>
          <span className={`absolute left-2 top-2 rounded-sm border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${STATUS_CLASS[project.status]} bg-background/80 backdrop-blur`}>
            {STATUS_LABEL[project.status]}
          </span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="font-mono text-base font-semibold text-foreground">{project.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {project.builderName ? `${project.builderName} · ` : ""}
              {project.localityName}
              {project.zoneName ? ` · ${project.zoneName}` : ""}
            </p>
          </div>
          {project.tagline ? <p className="text-xs text-muted">{project.tagline}</p> : null}
          {project.configurationSummary ? <p className="text-xs text-foreground">{project.configurationSummary}</p> : null}

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Starting price</p>
              <p className="font-mono text-sm text-foreground">{formatPriceBand(project.priceMinPaise)}</p>
            </div>
            {project.pricePerSqftPaise ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Price/sqft</p>
                <p className="font-mono text-sm text-foreground">{formatPricePerSqft(project.pricePerSqftPaise)}</p>
              </div>
            ) : project.pricePerSqftMasked ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Price/sqft</p>
                <p className="font-mono text-sm text-foreground" title="🔒 Sign in to unlock verified intelligence">
                  {maskPricePerSqft()}
                </p>
              </div>
            ) : null}
            {typeof project.constructionPercent === "number" ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Construction</p>
                <p className="font-mono text-sm text-foreground">{project.constructionPercent}%</p>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Possession</p>
              <p className="font-mono text-sm text-foreground">
                {formatPossessionMonthYear(project.possessionMonth, project.possessionYear, project.status, project.possessionDate)}
              </p>
            </div>
          </div>

          <div className="mt-1 flex gap-2">
            <Button href={`/projects/${project.slug}`} size="sm" fullWidth>
              View Project Intelligence
            </Button>
            {project.brochureAvailable && !project.brochureThumbnailUrl ? (
              <BrochureDownloadLink
                slug={project.slug}
                brochureUrl={project.brochureUrl ?? null}
                brochureFileName={project.brochureFileName}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
              >
                Brochure
              </BrochureDownloadLink>
            ) : null}
            {project.floorPlanUrl ? (
              <a
                href={floorPlanHref(project.floorPlanUrl, project.floorPlanKind)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
              >
                Floor Plan
              </a>
            ) : null}
          </div>
          {project.brochureAvailable && project.brochureThumbnailUrl ? (
            <BrochureDownloadLink
              slug={project.slug}
              brochureUrl={project.brochureUrl ?? null}
              brochureFileName={project.brochureFileName}
              className="flex items-center gap-3 rounded-sm border border-accent/30 bg-accent/5 p-2.5 transition-colors hover:bg-accent/10"
            >
              <Image
                src={project.brochureThumbnailUrl}
                alt={`${project.name} brochure thumbnail`}
                width={40}
                height={52}
                className="h-[52px] w-10 shrink-0 rounded-sm border border-border object-cover"
              />
              <span className="min-w-0 text-xs font-semibold text-foreground">Download Brochure</span>
            </BrochureDownloadLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
