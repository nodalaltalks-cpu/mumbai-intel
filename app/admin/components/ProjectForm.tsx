"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  autosaveProjectAction,
  createProjectAction,
  submitForReviewAction,
  togglePublishAction,
  updateProjectAction,
  withdrawFromReviewAction,
  type ProjectFormState,
} from "@/lib/actions/projects";
import {
  CATEGORY_LABEL,
  CONFIDENCE_LEVELS,
  DATA_SOURCES,
  PAYMENT_PLAN_TYPE_LABEL,
  POSSESSION_MONTH_LABEL,
  PROJECT_STATUSES,
  PROPERTY_CATEGORIES,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/lib/project-meta";
import { formatBytes, formatPaise } from "@/lib/format";
import { compressPdfFile } from "@/lib/pdf-compress";
import { CheckboxField, Field, FieldGroup, FormError, SelectField, TextareaField } from "./FormField";
import RichTextEditor from "./RichTextEditor";
import SubmitButton from "./SubmitButton";
import FormTabs, { type FormTab } from "./FormTabs";
import AmenitiesPicker, { type AmenityOption } from "./AmenitiesPicker";
import InlineEntityCreate from "./InlineEntityCreate";
import ProjectReviewModal, { type ReviewSection } from "./ProjectReviewModal";
import { createBuilderInlineAction, saveDeveloperSpokespersonAction, saveDeveloperWebsiteAction } from "@/lib/actions/builders";
import { createLocalityInlineAction } from "@/lib/actions/localities";
import { createMicroMarketInlineAction } from "@/lib/actions/micromarkets";
import type { ConfigurationRow } from "./ConfigurationsManager";
import type { PaymentMilestoneRow } from "./PaymentPlansManager";
import type { SpecificationRow } from "./SpecificationsManager";
import type { NearbyLinkRow } from "./NearbyPlacesManager";
import type { ProjectTimelineRow } from "./ProjectTimelineManager";
import type { FaqRow } from "./ProjectFaqsManager";
import type { SectionRow } from "./ProjectSectionsManager";
import type { ProjectDocumentRow } from "./DocumentsManager";
import ProgressIndicator from "./ProgressIndicator";
import type { ProjectImageItem } from "./ImageUploader";
import PriceAmountField from "./PriceAmountField";
import { rupeesToAmountUnit, amountUnitToRupees, type PriceUnit } from "@/lib/price-units";
import { slugify } from "@/lib/slug";

export interface ProjectFormData {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  builderId: string | null;
  developerGroup: string | null;
  localityId: string;
  microMarketId: string | null;
  highlights: string[];
  status: string;
  category: string;
  address: string | null;
  famousLandmark: string | null;
  googleMapsUrl: string | null;
  launchDate: Date | null;
  promisedPossession: Date | null;
  actualPossession: Date | null;
  possessionMonth: number | null;
  possessionYear: number | null;
  constructionPercent: number | null;
  reraNumber: string | null;
  reraCertificateUrl: string | null;
  totalUnits: number | null;
  totalTowers: number | null;
  landAreaAcres: number | null;
  priceMinPaise: number | null;
  paymentPlanType: string | null;
  paymentPlanDescription: string | null;
  dataSource: string;
  confidence: string;
  sourceRef: string | null;
  videoUrl: string | null;
  tour360Url: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isLuxury: boolean;
  isAffordable: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  submittedForReviewAt: Date | null;
  completionPercent: number;
  amenityIds: string[];
  configurations: ConfigurationRow[];
  paymentMilestones: PaymentMilestoneRow[];
  specifications: SpecificationRow[];
  documents: ProjectDocumentRow[];
  timelineEvents: ProjectTimelineRow[];
  faqs: FaqRow[];
  sections: SectionRow[];
  infraLinks: NearbyLinkRow[];
}

export interface SelectOption {
  id: string;
  name: string;
}

export interface LocalityOption extends SelectOption {
  microMarkets: SelectOption[];
}

/** Phase 68 — the canonical developer website/spokesperson travel with the select list itself (see getBuildersForSelect) so the Developer tab can show/reuse them the instant a builder is picked. */
export interface BuilderOption extends SelectOption {
  websiteUrl: string | null;
  spokespersonName: string | null;
  spokespersonDesignation: string | null;
}

const initialState: ProjectFormState = {};

/**
 * Phase 68 — simplified from 9 tabs to 7 groups matching the founder-facing
 * field model (PROJECT / PRICING & CONFIGURATION / REGULATORY / INTELLIGENCE
 * / MEDIA / DEVELOPER / a slim PUBLISHING). Every field this phase moved out
 * of the visible UI (tagline, Google Maps URL, payment plan, launch date,
 * actual possession, construction %, land area, total units/towers, video/360
 * URLs, SEO meta, trending/luxury/affordable, data source/confidence/source
 * ref) still round-trips through the form as a hidden input carrying its
 * EXISTING value unchanged — buildProjectData()/prisma.project.update writes
 * every one of these keys unconditionally on every save, so simply removing
 * a field from the DOM would silently null out real historical data. Nothing
 * is deleted from the database; it just stops being editable from this form.
 */
const TABS: FormTab[] = [
  { id: "project", label: "Project" },
  { id: "pricing", label: "Pricing & Configuration" },
  { id: "regulatory", label: "Regulatory" },
  { id: "intelligence", label: "Intelligence" },
  { id: "media", label: "Media" },
  { id: "developer", label: "Developer" },
  { id: "publishing", label: "Publishing" },
];

/**
 * Client-side mirror of the server's own completion logic — kept in sync by
 * hand (server module is server-only) so the live indicator never drifts
 * from what actually gets persisted. Phase 68 — rebuilt around the NEW
 * simplified minimum: the "40/40" philosophy is gone; this now checks only
 * whether the fields that still matter for a genuinely useful public page
 * are present (Requirement: "determine the exact minimum required fields").
 * Status/Category are deliberately excluded from any single check the same
 * way they always were: both are `<select>`s that always have SOME value
 * once rendered, so counting "has a value" would count their default as
 * user-entered data.
 */
type ProgressSection = { key: string; check: (data: FormData, ctx: { amenityCount: number; imageCount: number }) => boolean };

const PROGRESS_SECTIONS: ProgressSection[] = [
  { key: "project", check: (d) => Boolean(d.get("name")) && Boolean(d.get("localityId")) && Boolean(d.get("address")) },
  { key: "pricing", check: (d) => Boolean(d.get("priceMinRupees")) },
  { key: "regulatory", check: (d) => Boolean(d.get("reraNumber")) },
  { key: "intelligence", check: (d) => Boolean(d.get("description")) },
  { key: "media", check: (_d, ctx) => ctx.imageCount > 0 },
  { key: "publishing", check: (d) => d.get("isPublished") === "on" },
];

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default function ProjectForm({
  project,
  localities,
  builders,
  amenities,
  images = [],
  imageCount,
  isAdmin,
}: {
  project?: ProjectFormData;
  localities: LocalityOption[];
  builders: BuilderOption[];
  amenities: AmenityOption[];
  /** Images live in a separate table, not this form's own fields — passed in so the Media section's completion count works correctly. Always empty for a not-yet-created project. */
  images?: ProjectImageItem[];
  imageCount?: number;
  /** Only meaningful (and only ever passed) on the edit page — gates the Publish button below,
   * since togglePublishAction is admin-only, same as the identical Publish/Unpublish control on
   * the Projects list. */
  isAdmin?: boolean;
}) {
  const resolvedImageCount = imageCount ?? images.length;
  const action = project ? updateProjectAction.bind(null, project.id) : createProjectAction;
  const [state, formAction] = useActionState(action, initialState);
  const [activeTab, setActiveTab] = useState("project");
  const [progress, setProgress] = useState(project?.completionPercent ?? 0);
  const [underReview, setUnderReview] = useState(Boolean(project?.submittedForReviewAt));
  const [isReviewPending, startReviewTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const [publishResult, setPublishResult] = useState<{ success?: string; error?: string } | null>(null);
  const router = useRouter();
  const [localityOptions, setLocalityOptions] = useState(localities);
  const [builderOptions, setBuilderOptions] = useState(builders);
  const [nameValue, setNameValue] = useState(project?.name ?? "");
  const [slugValue, setSlugValue] = useState(project?.slug ?? "");
  // An existing project's slug is already "manually managed" from the moment the form
  // loads — editing Project Name must never silently rewrite a live, possibly-indexed
  // URL. Only a brand-new project (or one whose slug is genuinely still blank) auto-follows
  // Name as the admin types, and only until they type into Slug themselves.
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(project?.slug));
  const [selectedLocalityId, setSelectedLocalityId] = useState(project?.localityId ?? "");
  const [selectedBuilderId, setSelectedBuilderId] = useState(project?.builderId ?? "");
  const [selectedMicroMarketId, setSelectedMicroMarketId] = useState(project?.microMarketId ?? "");
  // Legacy records saved before possessionMonth/possessionYear existed only have promisedPossession
  // (a plain date) — derive the select defaults from it so re-saving the form without touching
  // Possession doesn't silently null the fields out (see reconcilePossession in lib/project-data.ts).
  const [possessionMonth, setPossessionMonth] = useState(
    project?.possessionMonth
      ? String(project.possessionMonth)
      : project?.promisedPossession
        ? String(new Date(project.promisedPossession).getMonth() + 1)
        : ""
  );
  const [possessionYear, setPossessionYear] = useState(
    project?.possessionYear
      ? String(project.possessionYear)
      : project?.promisedPossession
        ? String(new Date(project.promisedPossession).getFullYear())
        : ""
  );
  const initialPriceMin = rupeesToAmountUnit(project?.priceMinPaise !== null && project?.priceMinPaise !== undefined ? Number(project.priceMinPaise) / 100 : null);
  const [priceMinAmount, setPriceMinAmount] = useState(initialPriceMin.amount);
  const [priceMinUnit, setPriceMinUnit] = useState<PriceUnit>(initialPriceMin.unit);
  const [brochureFileName, setBrochureFileName] = useState<string | null>(null);
  const [brochureCompressing, setBrochureCompressing] = useState(false);
  const [brochureCompressionNote, setBrochureCompressionNote] = useState<string | null>(null);
  const brochureFileInputRef = useRef<HTMLInputElement>(null);

  // Same client-side compression as BrochureUploader.tsx's own PDF field (see
  // lib/pdf-compress.ts) -- this is the "attach a brochure while creating the project" shortcut
  // on the General tab, so it needs the same treatment as the edit page's Media tab uploader.
  async function handleBrochureFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      setBrochureFileName(null);
      setBrochureCompressionNote(null);
      return;
    }
    setBrochureFileName(selected.name);
    setBrochureCompressing(true);
    setBrochureCompressionNote(null);
    const result = await compressPdfFile(selected);
    if (result.compressed && brochureFileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(result.file);
      brochureFileInputRef.current.files = dataTransfer.files;
      setBrochureCompressionNote(`Compressed ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`);
    }
    setBrochureCompressing(false);
  }
  const [coverImageFileName, setCoverImageFileName] = useState<string | null>(null);
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string | null>(null);
  const coverImageFileInputRef = useRef<HTMLInputElement>(null);
  const microMarketOptions = localityOptions.find((l) => l.id === selectedLocalityId)?.microMarkets ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, startAutosaveTransition] = useTransition();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSections, setReviewSections] = useState<ReviewSection[]>([]);
  /** Snapshot of the Published checkbox AT THE MOMENT "Review before submitting" was
   * clicked -- drives the submit button's label. Reading `project.isPublished` there
   * instead would show the project's stale persisted state, not what this pending
   * submit is actually about to save (e.g. a founder who just checked "Published" on a
   * previously-draft project would see the button say "Save Draft" while it in fact
   * publishes). */
  const [reviewIsPublished, setReviewIsPublished] = useState(false);

  // ── Phase 68 — Developer Website / Spokesperson reuse ──────────────────
  // Deliberately separate persistence from the main form save (same "explicit
  // founder approval required to change" discipline as the Discovery Queue's
  // own developer-website reuse, lib/actions/builders.ts's saveDeveloperWebsiteAction) —
  // these two mini-forms call their own server actions directly and never
  // silently overwrite the canonical Builder row as a side effect of saving
  // unrelated project fields.
  const selectedBuilder = builderOptions.find((b) => b.id === selectedBuilderId) ?? null;
  const [developerWebsiteDraft, setDeveloperWebsiteDraft] = useState(selectedBuilder?.websiteUrl ?? "");
  const [websiteSaving, setWebsiteSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [spokespersonNameDraft, setSpokespersonNameDraft] = useState(selectedBuilder?.spokespersonName ?? "");
  const [spokespersonDesignationDraft, setSpokespersonDesignationDraft] = useState(selectedBuilder?.spokespersonDesignation ?? "");
  const [spokespersonSaving, setSpokespersonSaving] = useState(false);
  const [spokespersonError, setSpokespersonError] = useState<string | null>(null);
  const lastSyncedBuilderIdRef = useRef(selectedBuilderId);

  // Re-sync the drafts whenever the founder switches which developer is selected — never
  // while they're still editing the SAME developer's draft (that would clobber their typing).
  if (lastSyncedBuilderIdRef.current !== selectedBuilderId) {
    lastSyncedBuilderIdRef.current = selectedBuilderId;
    // eslint-disable-next-line react-hooks/set-state-in-render -- syncing local draft state to a prop-derived value on selection change, not a side effect
    setDeveloperWebsiteDraft(selectedBuilder?.websiteUrl ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-render
    setSpokespersonNameDraft(selectedBuilder?.spokespersonName ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-render
    setSpokespersonDesignationDraft(selectedBuilder?.spokespersonDesignation ?? "");
    setWebsiteError(null);
    setSpokespersonError(null);
  }

  async function handleSaveDeveloperWebsite() {
    if (!selectedBuilder) return;
    const trimmed = developerWebsiteDraft.trim();
    if (!trimmed) return;
    if (selectedBuilder.websiteUrl && selectedBuilder.websiteUrl !== trimmed) {
      const confirmed = window.confirm(
        `${selectedBuilder.name} already has a saved website (${selectedBuilder.websiteUrl}). Update it to "${trimmed}" for every project by this developer?`
      );
      if (!confirmed) return;
    }
    setWebsiteSaving(true);
    setWebsiteError(null);
    const result = await saveDeveloperWebsiteAction(selectedBuilder.name, trimmed);
    setWebsiteSaving(false);
    if (result.ok && result.websiteUrl) {
      setBuilderOptions((prev) => prev.map((b) => (b.id === selectedBuilder.id ? { ...b, websiteUrl: result.websiteUrl! } : b)));
      router.refresh();
    } else {
      setWebsiteError(result.error ?? "Could not save the developer website.");
    }
  }

  async function handleSaveSpokesperson() {
    if (!selectedBuilder) return;
    setSpokespersonSaving(true);
    setSpokespersonError(null);
    const result = await saveDeveloperSpokespersonAction(selectedBuilder.id, spokespersonNameDraft, spokespersonDesignationDraft);
    setSpokespersonSaving(false);
    if (result.ok) {
      const nextName = spokespersonNameDraft.trim() || null;
      const nextDesignation = spokespersonDesignationDraft.trim() || null;
      setBuilderOptions((prev) =>
        prev.map((b) => (b.id === selectedBuilder.id ? { ...b, spokespersonName: nextName, spokespersonDesignation: nextDesignation } : b))
      );
      router.refresh();
    } else {
      setSpokespersonError(result.error ?? "Could not save the spokesperson.");
    }
  }

  function recomputeProgress() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const ctx = { amenityCount: data.getAll("amenityIds").length, imageCount: resolvedImageCount };
    const complete = PROGRESS_SECTIONS.filter((s) => s.check(data, ctx)).length;
    setProgress(Math.round((complete / PROGRESS_SECTIONS.length) * 100));
  }

  function openReview() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const g = (name: string) => (data.get(name) as string) ?? "";
    const label = <T extends string,>(map: Record<T, string>, key: string) => (map as Record<string, string>)[key] ?? key;
    const builderName = builderOptions.find((b) => b.id === selectedBuilderId)?.name ?? "";
    const localityName = localityOptions.find((l) => l.id === selectedLocalityId)?.name ?? "";
    const microMarketName = microMarketOptions.find((m) => m.id === g("microMarketId"))?.name ?? "";
    const amenityCount = data.getAll("amenityIds").length;
    const highlightsCount = g("highlights").split("\n").map((s) => s.trim()).filter(Boolean).length;
    const priceMin = g("priceMinRupees");

    setReviewSections([
      {
        title: "Project",
        rows: [
          { label: "Project Name", value: g("name"), important: true },
          { label: "Slug", value: g("slug") },
          { label: "Builder", value: builderName || "No builder" },
          { label: "Locality", value: localityName, important: true },
          { label: "Micro market", value: microMarketName },
          { label: "Status", value: g("status") ? label(STATUS_LABEL, g("status")) : "" },
          { label: "Category", value: g("category") ? label(CATEGORY_LABEL, g("category")) : "" },
          { label: "Address", value: g("address"), important: true },
        ],
      },
      {
        title: "Pricing & Configuration",
        rows: [
          { label: "Starting price", value: priceMin ? formatPaise(Number(priceMin) * 100) : "", important: true },
          { label: "Unit configurations", value: project?.configurations.length ? `${project.configurations.length} saved` : "" },
        ],
      },
      {
        title: "Regulatory",
        rows: [
          { label: "RERA number", value: g("reraNumber"), important: true },
          {
            label: "Possession",
            value: g("possessionMonth") && g("possessionYear") ? `${POSSESSION_MONTH_LABEL[Number(g("possessionMonth"))]} ${g("possessionYear")}` : "",
          },
        ],
      },
      {
        title: "Intelligence",
        rows: [
          { label: "Description", value: g("description") ? "Provided" : "", important: true },
          { label: "Highlights", value: highlightsCount ? `${highlightsCount} listed` : "" },
          { label: "Amenities", value: amenityCount ? `${amenityCount} amenities` : "" },
        ],
      },
      {
        title: "Media",
        rows: [
          ...(!project
            ? [
                { label: "Cover image", value: coverImageFileName ?? "", important: true },
                { label: "Brochure", value: brochureFileName ?? "" },
              ]
            : []),
          { label: "Images", value: resolvedImageCount ? `${resolvedImageCount} uploaded` : "", important: true },
        ],
      },
      {
        title: "Developer",
        rows: [
          { label: "Website", value: selectedBuilder?.websiteUrl ? "Saved" : "" },
          { label: "Spokesperson", value: selectedBuilder?.spokespersonName ?? "" },
        ],
      },
      {
        title: "Publishing",
        rows: [
          { label: "Published", value: data.get("isPublished") === "on" ? "Yes" : "No", important: true },
          { label: "Featured", value: data.get("isFeatured") === "on" ? "Yes" : "No" },
        ],
      },
    ]);
    setReviewIsPublished(data.get("isPublished") === "on");
    setReviewOpen(true);
  }

  function handleFormChange() {
    dirtyRef.current = true;
    recomputeProgress();
  }

  // Autosave draft: only meaningful once the project exists (edit mode). Before that, the
  // whole form is plain client-side state (every tab panel stays mounted, just CSS-hidden --
  // see the `activeTab === ... ? ... : "hidden"` wrappers below), so nothing needs saving or
  // touches the database until the admin explicitly reviews and clicks Save Draft.
  function scheduleAutosave() {
    if (!project || !formRef.current) return;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setAutosaveStatus("saving");
    const data = new FormData(formRef.current);
    startAutosaveTransition(async () => {
      const result = await autosaveProjectAction(project.id, data);
      setAutosaveStatus(result.error ? "idle" : "saved");
    });
  }

  useEffect(() => {
    recomputeProgress();
  }, []);

  // If the server action comes back with an error, close the review modal —
  // otherwise it would sit on top of FormError's message and hide the very
  // thing the admin needs to fix.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing UI to the server action's outcome, not derivable from render
    if (state.error) setReviewOpen(false);
  }, [state.error]);

  // Inline-created Builder/Locality selections update React state directly
  // (setSelectedBuilderId/setSelectedLocalityId), which does NOT dispatch a
  // native <select> change event — so handleFormChange's onChange listener
  // never sees it. This effect runs after the DOM commits the new value
  // (so recomputeProgress reads the correct FormData) and covers both the
  // inline-create path and normal manual selection uniformly.
  const skipNextRef = useRef(true);
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    dirtyRef.current = true;
    recomputeProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilderId, selectedLocalityId, selectedMicroMarketId]);

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange} onBlur={scheduleAutosave} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <p className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-muted">
        Fields marked <span className="text-negative">*</span> are important. Everything else is optional — leave it
        blank if it isn&apos;t available yet.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProgressIndicator percent={progress} />
        <div className="flex items-center gap-2">
          {project ? (
            <span className="font-mono text-[10px] text-muted">
              {autosaveStatus === "saving" ? "Saving draft…" : autosaveStatus === "saved" ? "Draft autosaved" : "Autosave on blur"}
            </span>
          ) : null}
          {project && !project.isPublished ? (
            <>
              {underReview ? (
                <span className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">
                  Under Review
                </span>
              ) : null}
              <button
                type="button"
                disabled={isReviewPending}
                onClick={() =>
                  startReviewTransition(async () => {
                    if (underReview) await withdrawFromReviewAction(project.id);
                    else await submitForReviewAction(project.id);
                    setUnderReview(!underReview);
                  })
                }
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {isReviewPending ? "…" : underReview ? "Withdraw from review" : "Submit for review"}
              </button>
              {isAdmin && progress === 100 ? (
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={() =>
                    startPublishTransition(async () => {
                      const result = await togglePublishAction(project.id, true);
                      setPublishResult(result);
                      router.refresh();
                    })
                  }
                  className="rounded-sm bg-positive px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-white hover:bg-positive/90 disabled:opacity-60"
                >
                  {isPublishing ? "Publishing…" : "Publish to website"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        {publishResult?.success ? (
          <p className="mt-2 rounded-sm border border-positive/40 bg-positive/10 px-3 py-2 text-xs text-positive">{publishResult.success}</p>
        ) : null}
        {publishResult?.error ? (
          <p className="mt-2 rounded-sm border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{publishResult.error}</p>
        ) : null}
      </div>

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── PROJECT ── */}
      <div className={activeTab === "project" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field
            label="Project Name"
            name="name"
            important
            value={nameValue}
            onChange={(e) => {
              const next = e.target.value;
              setNameValue(next);
              if (!slugManuallyEdited) setSlugValue(slugify(next));
            }}
            placeholder="Lodha Park"
          />
          <div className="flex flex-col gap-1.5">
            <Field
              label="Slug (optional)"
              name="slug"
              value={slugValue}
              onChange={(e) => {
                setSlugValue(e.target.value);
                setSlugManuallyEdited(true);
              }}
              placeholder="auto-generated from project name"
            />
            {slugManuallyEdited ? (
              <button
                type="button"
                onClick={() => {
                  setSlugValue(slugify(nameValue));
                  setSlugManuallyEdited(false);
                }}
                className="self-start text-[10px] font-mono uppercase tracking-wide text-accent hover:underline"
              >
                Reset to auto slug
              </button>
            ) : null}
          </div>
        </FieldGroup>
        <FieldGroup>
          <div>
            <SelectField label="Developer (optional)" name="builderId" value={selectedBuilderId} onChange={(e) => setSelectedBuilderId(e.target.value)}>
              <option value="">No developer</option>
              {builderOptions.map((builder) => (
                <option key={builder.id} value={builder.id}>
                  {builder.name}
                </option>
              ))}
            </SelectField>
            <InlineEntityCreate
              label="Developer"
              action={async (name) => {
                const result = await createBuilderInlineAction(name);
                return result;
              }}
              onCreated={({ id, name }) => {
                setBuilderOptions((prev) => [...prev, { id, name, websiteUrl: null, spokespersonName: null, spokespersonDesignation: null }]);
                setSelectedBuilderId(id);
              }}
            />
          </div>
          <div>
            <SelectField
              label="Locality"
              name="localityId"
              important
              value={selectedLocalityId}
              onChange={(e) => {
                setSelectedLocalityId(e.target.value);
                setSelectedMicroMarketId("");
              }}
            >
              <option value="" disabled>
                Select a locality
              </option>
              {localityOptions.map((locality) => (
                <option key={locality.id} value={locality.id}>
                  {locality.name}
                </option>
              ))}
            </SelectField>
            <InlineEntityCreate
              label="Locality"
              action={async (name) => {
                const result = await createLocalityInlineAction(name);
                return result;
              }}
              onCreated={({ id, name }) => {
                setLocalityOptions((prev) => [...prev, { id, name, microMarkets: [] }]);
                setSelectedLocalityId(id);
                setSelectedMicroMarketId("");
              }}
            />
          </div>
        </FieldGroup>
        <FieldGroup>
          <div>
            <SelectField
              label="Micro market (optional)"
              name="microMarketId"
              value={selectedMicroMarketId}
              onChange={(e) => setSelectedMicroMarketId(e.target.value)}
            >
              <option value="">
                {microMarketOptions.length === 0 ? "None catalogued for this locality" : "None"}
              </option>
              {microMarketOptions.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.name}
                </option>
              ))}
            </SelectField>
            {selectedLocalityId ? (
              <InlineEntityCreate
                label="Micro market"
                action={async (name) => {
                  const result = await createMicroMarketInlineAction(selectedLocalityId, name);
                  return result;
                }}
                onCreated={({ id, name }) => {
                  setLocalityOptions((prev) =>
                    prev.map((locality) =>
                      locality.id === selectedLocalityId
                        ? { ...locality, microMarkets: [...locality.microMarkets, { id, name }] }
                        : locality
                    )
                  );
                  setSelectedMicroMarketId(id);
                }}
              />
            ) : (
              <p className="mt-1 text-[11px] text-muted">Select a locality first to add a micro market.</p>
            )}
          </div>
          <div />
        </FieldGroup>
        <FieldGroup>
          <SelectField label="Status" name="status" important defaultValue={project?.status ?? ""}>
            {!project ? (
              <option value="" disabled>
                Select a status
              </option>
            ) : null}
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" name="category" important defaultValue={project?.category ?? ""}>
            {!project ? (
              <option value="" disabled>
                Select a category
              </option>
            ) : null}
            {PROPERTY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </SelectField>
        </FieldGroup>
        <Field label="Address" name="address" important defaultValue={project?.address ?? ""} />

        {/* Deprioritized fields — hidden from the founder form, values preserved unchanged on every save. */}
        <input type="hidden" name="tagline" defaultValue={project?.tagline ?? ""} />
        <input type="hidden" name="developerGroup" defaultValue={project?.developerGroup ?? ""} />
        <input type="hidden" name="famousLandmark" defaultValue={project?.famousLandmark ?? ""} />
        <input type="hidden" name="googleMapsUrl" defaultValue={project?.googleMapsUrl ?? ""} />
      </div>

      {/* ── PRICING & CONFIGURATION ── */}
      <div className={activeTab === "pricing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <PriceAmountField
            label="Starting price"
            name="priceMinRupees"
            important
            amount={priceMinAmount}
            unit={priceMinUnit}
            onAmountChange={setPriceMinAmount}
            onUnitChange={setPriceMinUnit}
            rupees={amountUnitToRupees(priceMinAmount, priceMinUnit)}
          />
        </FieldGroup>
        {project ? (
          <p className="text-xs text-muted">
            Unit configurations (2 BHK, 3 BHK…) and their own price bands are managed in the Configurations card below
            this form, after you save.
          </p>
        ) : (
          <p className="text-xs text-muted">Unit configurations can be added once this project is created.</p>
        )}

        {/* Deprioritized fields — hidden, values preserved unchanged. */}
        <input type="hidden" name="paymentPlanType" defaultValue={project?.paymentPlanType ?? ""} />
        <input type="hidden" name="paymentPlanDescription" defaultValue={project?.paymentPlanDescription ?? ""} />
      </div>

      {/* ── REGULATORY ── */}
      <div className={activeTab === "regulatory" ? "flex flex-col gap-4" : "hidden"}>
        <Field label="RERA number" name="reraNumber" important defaultValue={project?.reraNumber ?? ""} />
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted">Possession</span>
          <div className="mt-1.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Possession Month"
              name="possessionMonth"
              value={possessionMonth}
              onChange={(e) => setPossessionMonth(e.target.value)}
            >
              <option value="">Not set</option>
              {POSSESSION_MONTH_LABEL.slice(1).map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </SelectField>
            <Field
              label="Possession Year"
              name="possessionYear"
              type="number"
              min={2000}
              max={2100}
              value={possessionYear}
              onChange={(e) => setPossessionYear(e.target.value)}
              placeholder="e.g. 2028"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            Preview:{" "}
            <span className="font-mono text-foreground">
              {possessionMonth && possessionYear ? `${POSSESSION_MONTH_LABEL[Number(possessionMonth)]} ${possessionYear}` : "—"}
            </span>
          </p>
        </div>

        {/* Deprioritized fields — hidden, values preserved unchanged. */}
        <input type="hidden" name="reraCertificateUrl" defaultValue={project?.reraCertificateUrl ?? ""} />
        <input type="hidden" name="launchDate" defaultValue={toDateInputValue(project?.launchDate ?? null)} />
        <input type="hidden" name="actualPossession" defaultValue={toDateInputValue(project?.actualPossession ?? null)} />
        <input type="hidden" name="constructionPercent" defaultValue={project?.constructionPercent ?? ""} />
        <input type="hidden" name="landAreaAcres" defaultValue={project?.landAreaAcres ?? ""} />
        <input type="hidden" name="totalUnits" defaultValue={project?.totalUnits ?? ""} />
        <input type="hidden" name="totalTowers" defaultValue={project?.totalTowers ?? ""} />
      </div>

      {/* ── INTELLIGENCE ── */}
      <div className={activeTab === "intelligence" ? "flex flex-col gap-4" : "hidden"}>
        <RichTextEditor
          label="Description"
          name="description"
          important
          defaultValue={project?.description ?? ""}
          onChange={() => {
            dirtyRef.current = true;
            recomputeProgress();
          }}
        />
        <TextareaField
          label="Highlights (one per line)"
          name="highlights"
          defaultValue={project?.highlights.join("\n") ?? ""}
          placeholder={"5 min walk to metro\nSea-facing corner units\nRERA registered"}
          hint="Short bullet differentiators shown near the top of the detail page"
        />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Amenities</p>
          <AmenitiesPicker
            amenities={amenities}
            defaultSelectedIds={project?.amenityIds ?? []}
            isProjectContext
            projectId={project?.id}
            onSelectionChange={() => {
              dirtyRef.current = true;
              recomputeProgress();
            }}
          />
        </div>
      </div>

      {/* ── MEDIA ── */}
      <div className={activeTab === "media" ? "flex flex-col gap-4" : "hidden"}>
        {project ? null : (
          <div className="rounded-sm border border-border bg-surface p-4">
            <h3 className="font-mono text-sm font-semibold text-foreground">
              Cover Image <span className="text-negative">*</span>
            </h3>
            <p className="mt-1 text-xs text-muted">
              The primary image shown on Project Cards, search results, Compare, Wishlist, Recently Viewed and
              everywhere this project is listed.
            </p>

            {coverImagePreviewUrl ? (
              <div className="mt-3 overflow-hidden rounded-sm border border-border bg-background" style={{ width: "12rem" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImagePreviewUrl} alt="" className="h-32 w-48 object-cover" />
              </div>
            ) : null}

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">
                {coverImageFileName ? "Replace Image" : "Upload Cover Image"}
              </span>
              <input
                ref={coverImageFileInputRef}
                type="file"
                name="coverImageFile"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (coverImagePreviewUrl) URL.revokeObjectURL(coverImagePreviewUrl);
                  setCoverImageFileName(file?.name ?? null);
                  setCoverImagePreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
              />
              <span className="text-[10px] text-muted">Allowed: JPG, PNG, WEBP · Recommended: 1600×900 · Max size: 5MB</span>
            </label>
            {coverImageFileName ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-muted">{coverImageFileName} will upload once you save.</span>
                <button
                  type="button"
                  onClick={() => {
                    if (coverImageFileInputRef.current) coverImageFileInputRef.current.value = "";
                    if (coverImagePreviewUrl) URL.revokeObjectURL(coverImagePreviewUrl);
                    setCoverImageFileName(null);
                    setCoverImagePreviewUrl(null);
                  }}
                  className="rounded-sm border border-negative/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-negative hover:bg-negative/10"
                >
                  Remove Image
                </button>
              </div>
            ) : (
              <span className="mt-2 block text-[10px] text-muted">
                Uploaded when you save this project — no need to come back to the edit page just for the cover image.
              </span>
            )}
          </div>
        )}

        {project ? (
          <p className="text-xs text-muted">
            {/* Phase 68.1 — Cover Image moved out to its own card (below, after this form) alongside
                Brochure: CoverImageUploader renders its own <form>, which is invalid HTML nested inside
                this form and was silently breaking this form's own save/autosave (see CoverImageUploader.tsx). */}
            The Cover Image and Project Brochure are each managed in their own card below, after this form — every
            save there is independent of this form. Gallery, Floor Plans, Master Plan and Documents each have their
            own card too.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">Project brochure (optional, PDF)</span>
              <input
                ref={brochureFileInputRef}
                type="file"
                name="brochureFile"
                accept="application/pdf"
                disabled={brochureCompressing}
                onChange={handleBrochureFileChange}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white disabled:opacity-60"
              />
              {brochureCompressing ? (
                <span className="text-[10px] text-muted">Compressing PDF for a smaller upload…</span>
              ) : brochureFileName ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted">
                    {brochureFileName} will upload once you save.
                    {brochureCompressionNote ? ` ${brochureCompressionNote}.` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (brochureFileInputRef.current) brochureFileInputRef.current.value = "";
                      setBrochureFileName(null);
                      setBrochureCompressionNote(null);
                    }}
                    className="rounded-sm border border-negative/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-negative hover:bg-negative/10"
                  >
                    Delete &amp; choose another
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-muted">
                  Uploaded when you save this project — no need to come back to the edit page just for the brochure.
                  Downloadable by every visitor immediately, with no sign-in required.
                </span>
              )}
            </label>
            <div className="rounded-sm border border-dashed border-border p-4 text-xs text-muted">
              <p>Gallery, Floor Plans, Master Plan and Documents need the project saved first — each gets its own card on the edit page:</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {["Gallery", "Floor Plans", "Master Plan", "Documents"].map((label) => (
                  <li key={label} className="rounded-sm border border-border bg-surface px-2 py-1 text-[10px] font-mono uppercase tracking-wide">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Deprioritized fields — hidden, values preserved unchanged. */}
        <input type="hidden" name="videoUrl" defaultValue={project?.videoUrl ?? ""} />
        <input type="hidden" name="tour360Url" defaultValue={project?.tour360Url ?? ""} />
      </div>

      {/* ── DEVELOPER ── */}
      <div className={activeTab === "developer" ? "flex flex-col gap-4" : "hidden"}>
        {selectedBuilder ? (
          <>
            <div className="rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-sm font-semibold text-foreground">Developer Website</h3>
              <p className="mt-1 text-xs text-muted">
                Reused automatically across every project by {selectedBuilder.name} — saved once here, never pasted
                again.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field
                  label={selectedBuilder.websiteUrl ? "Current saved website" : "No saved website yet"}
                  name="developerWebsiteDraft"
                  type="url"
                  value={developerWebsiteDraft}
                  onChange={(e) => setDeveloperWebsiteDraft(e.target.value)}
                  placeholder="https://www.example.com"
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={
                    websiteSaving ||
                    !developerWebsiteDraft.trim() ||
                    developerWebsiteDraft.trim() === (selectedBuilder.websiteUrl ?? "")
                  }
                  onClick={handleSaveDeveloperWebsite}
                  className="w-fit rounded-sm border border-accent/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  {websiteSaving ? "Saving…" : selectedBuilder.websiteUrl ? "Update Developer Website" : "Save to Developer"}
                </button>
              </div>
              {websiteError ? <p className="mt-1.5 text-[11px] text-negative">{websiteError}</p> : null}
            </div>

            <div className="rounded-sm border border-border bg-surface p-4">
              <h3 className="font-mono text-sm font-semibold text-foreground">
                Developer Spokesperson <span className="font-normal normal-case text-muted">(optional)</span>
              </h3>
              <p className="mt-1 text-xs text-muted">Also reused across every project by {selectedBuilder.name}.</p>
              <FieldGroup>
                <Field
                  label="Name"
                  name="spokespersonNameDraft"
                  value={spokespersonNameDraft}
                  onChange={(e) => setSpokespersonNameDraft(e.target.value)}
                  placeholder="e.g. Rohan Mehta"
                />
                <Field
                  label="Designation"
                  name="spokespersonDesignationDraft"
                  value={spokespersonDesignationDraft}
                  onChange={(e) => setSpokespersonDesignationDraft(e.target.value)}
                  placeholder="e.g. Head of Sales"
                />
              </FieldGroup>
              <button
                type="button"
                disabled={spokespersonSaving}
                onClick={handleSaveSpokesperson}
                className="mt-3 w-fit rounded-sm border border-accent/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {spokespersonSaving ? "Saving…" : "Save Spokesperson"}
              </button>
              {spokespersonError ? <p className="mt-1.5 text-[11px] text-negative">{spokespersonError}</p> : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Select a developer in the Project tab to manage their website and spokesperson.</p>
        )}
      </div>

      {/* ── PUBLISHING ── */}
      <div className={activeTab === "publishing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <CheckboxField label="Published — visible on the public site" name="isPublished" defaultChecked={project?.isPublished ?? false} hint="Leave unchecked to keep this a draft" />
          <CheckboxField label="Featured — spotlighted placement" name="isFeatured" defaultChecked={project?.isFeatured ?? false} />
        </FieldGroup>

        {/* Deprioritized / internal fields — hidden, values preserved unchanged. */}
        {project?.isTrending ? <input type="hidden" name="isTrending" value="on" /> : null}
        {project?.isLuxury ? <input type="hidden" name="isLuxury" value="on" /> : null}
        {project?.isAffordable ? <input type="hidden" name="isAffordable" value="on" /> : null}
        <input type="hidden" name="dataSource" defaultValue={project?.dataSource ?? "MANUALLY_VERIFIED"} />
        <input type="hidden" name="confidence" defaultValue={project?.confidence ?? "HIGH"} />
        <input type="hidden" name="sourceRef" defaultValue={project?.sourceRef ?? ""} />
        {/* Phase 68.1 — clamped to the same limits as lib/project-data.ts's projectSchema
            (MAX_META_TITLE=70 / MAX_META_DESCRIPTION=160; can't import the constants
            themselves here, same "server-only" module boundary as PROGRESS_SECTIONS above).
            A handful of existing projects have a metaTitle/metaDescription longer than these
            limits (set before this form enforced maxLength, e.g. via enrichment) -- submitting
            that value unclamped through this now-hidden field made parseProjectForm() reject
            the WHOLE save with no visible error, silently blocking every other edit on the
            form (address, developer, publish state, ...) for that project. Clamping here only
            ever affects that pre-existing-oversized case; every value already within range is
            unaffected. */}
        <input type="hidden" name="metaTitle" defaultValue={(project?.metaTitle ?? "").slice(0, 70)} />
        <input type="hidden" name="metaDescription" defaultValue={(project?.metaDescription ?? "").slice(0, 160)} />
        <input type="hidden" name="ogImageUrl" defaultValue={project?.ogImageUrl ?? ""} />
      </div>

      <div>
        <button
          type="button"
          onClick={openReview}
          className="rounded-sm bg-accent px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-dim"
        >
          Review before submitting
        </button>
      </div>

      {reviewOpen ? (
        <ProjectReviewModal
          sections={reviewSections}
          onClose={() => setReviewOpen(false)}
          actions={<SubmitButton>{project ? (reviewIsPublished ? "Save changes" : "Save Draft") : reviewIsPublished ? "Save & publish" : "Save Draft"}</SubmitButton>}
        />
      ) : null}
    </form>
  );
}
