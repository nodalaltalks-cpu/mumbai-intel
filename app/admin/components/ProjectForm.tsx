"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import {
  autosaveProjectAction,
  createProjectAction,
  submitForReviewAction,
  updateProjectAction,
  withdrawFromReviewAction,
  type ProjectFormState,
} from "@/lib/actions/projects";
import {
  CATEGORY_LABEL,
  CONFIDENCE_LEVELS,
  DATA_SOURCES,
  PROJECT_STATUSES,
  PROPERTY_CATEGORIES,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/lib/project-meta";
import { CheckboxField, Field, FieldGroup, FormError, SelectField, TextareaField } from "./FormField";
import RichTextEditor from "./RichTextEditor";
import SubmitButton from "./SubmitButton";
import FormTabs, { type FormTab } from "./FormTabs";
import MapEmbed from "./MapEmbed";
import AmenitiesPicker, { type AmenityOption } from "./AmenitiesPicker";
import InlineEntityCreate from "./InlineEntityCreate";
import { createBuilderInlineAction } from "@/lib/actions/builders";
import { createLocalityInlineAction } from "@/lib/actions/localities";
import type { ConfigurationRow } from "./ConfigurationsManager";
import type { SpecificationRow } from "./SpecificationsManager";
import type { NearbyLinkRow } from "./NearbyPlacesManager";
import type { ProjectTimelineRow } from "./ProjectTimelineManager";
import type { FaqRow } from "./ProjectFaqsManager";
import type { SectionRow } from "./ProjectSectionsManager";
import type { ProjectDocumentRow } from "./DocumentsManager";
import ProgressIndicator from "./ProgressIndicator";

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
  latitude: number | null;
  longitude: number | null;
  launchDate: Date | null;
  promisedPossession: Date | null;
  actualPossession: Date | null;
  constructionPercent: number | null;
  reraNumber: string | null;
  reraStatus: string | null;
  totalUnits: number | null;
  totalTowers: number | null;
  landAreaAcres: number | null;
  priceMinPaise: bigint | null;
  priceMaxPaise: bigint | null;
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

const initialState: ProjectFormState = {};

const TABS: FormTab[] = [
  { id: "general", label: "General" },
  { id: "location", label: "Location" },
  { id: "pricing", label: "Pricing" },
  { id: "construction", label: "Construction" },
  { id: "amenities", label: "Amenities" },
  { id: "description", label: "Description" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
];

/**
 * Client-side mirror of lib/project-completion.ts's section list — kept in
 * sync by hand (the server module is server-only and can't be imported from
 * a Client Component) so the live indicator never drifts from what actually
 * gets persisted. Status/Category are deliberately NOT part of this list:
 * both are `<select>`s that always have SOME value once rendered, so
 * counting "has a value" would count their default as user-entered data —
 * exactly the bug that made a brand-new project start at 17% instead of 0%.
 */
type ProgressSection = { key: string; check: (data: FormData, ctx: { amenityCount: number; imageCount: number }) => boolean };

const PROGRESS_SECTIONS: ProgressSection[] = [
  { key: "general", check: (d) => Boolean(d.get("name")) && Boolean(d.get("description")) },
  { key: "location", check: (d) => Boolean(d.get("localityId")) && Boolean(d.get("address")) },
  { key: "pricing", check: (d) => Boolean(d.get("priceMinRupees")) && Boolean(d.get("reraNumber")) },
  { key: "construction", check: (d) => Boolean(d.get("launchDate")) && Boolean(d.get("totalUnits")) },
  { key: "amenities", check: (_d, ctx) => ctx.amenityCount > 0 },
  { key: "media", check: (d, ctx) => ctx.imageCount > 0 || Boolean(d.get("videoUrl")) || Boolean(d.get("tour360Url")) },
  { key: "seo", check: (d) => Boolean(d.get("metaTitle")) && Boolean(d.get("metaDescription")) },
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
  imageCount = 0,
}: {
  project?: ProjectFormData;
  localities: LocalityOption[];
  builders: SelectOption[];
  amenities: AmenityOption[];
  /** Images live in a separate table (ImageUploader), not this form's own fields — passed in so the Media section counts correctly. Always 0 for a not-yet-created project. */
  imageCount?: number;
}) {
  const action = project ? updateProjectAction.bind(null, project.id) : createProjectAction;
  const [state, formAction] = useActionState(action, initialState);
  const [activeTab, setActiveTab] = useState("general");
  const [progress, setProgress] = useState(project?.completionPercent ?? 0);
  const [underReview, setUnderReview] = useState(Boolean(project?.submittedForReviewAt));
  const [isReviewPending, startReviewTransition] = useTransition();
  const [lat, setLat] = useState<number | null>(project?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(project?.longitude ?? null);
  const [localityOptions, setLocalityOptions] = useState(localities);
  const [builderOptions, setBuilderOptions] = useState(builders);
  const [selectedLocalityId, setSelectedLocalityId] = useState(project?.localityId ?? "");
  const [selectedBuilderId, setSelectedBuilderId] = useState(project?.builderId ?? "");
  const [brochureFileName, setBrochureFileName] = useState<string | null>(null);
  const microMarketOptions = localityOptions.find((l) => l.id === selectedLocalityId)?.microMarkets ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, startAutosaveTransition] = useTransition();

  function recomputeProgress() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const ctx = { amenityCount: data.getAll("amenityIds").length, imageCount };
    const complete = PROGRESS_SECTIONS.filter((s) => s.check(data, ctx)).length;
    setProgress(Math.round((complete / PROGRESS_SECTIONS.length) * 100));
  }

  function handleFormChange(event: ChangeEvent<HTMLFormElement>) {
    dirtyRef.current = true;
    recomputeProgress();
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      if (target.name === "latitude") setLat(target.value ? Number(target.value) : null);
      if (target.name === "longitude") setLng(target.value ? Number(target.value) : null);
    }
  }

  // Autosave draft: only meaningful once the project exists (edit mode).
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
  }, [selectedBuilderId, selectedLocalityId]);

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange} onBlur={scheduleAutosave} className="flex flex-col gap-4">
      <FormError message={state.error} />

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
            </>
          ) : null}
        </div>
      </div>

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className={activeTab === "general" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Name" name="name" required defaultValue={project?.name} placeholder="Lodha Park" />
          <Field label="Slug (optional)" name="slug" defaultValue={project?.slug} placeholder="auto-generated from name" />
        </FieldGroup>
        <Field label="Tagline" name="tagline" defaultValue={project?.tagline ?? ""} placeholder="One-line pitch" />
        <FieldGroup>
          <div>
            <SelectField label="Builder (optional)" name="builderId" value={selectedBuilderId} onChange={(e) => setSelectedBuilderId(e.target.value)}>
              <option value="">No builder</option>
              {builderOptions.map((builder) => (
                <option key={builder.id} value={builder.id}>
                  {builder.name}
                </option>
              ))}
            </SelectField>
            <InlineEntityCreate
              label="Builder"
              action={async (name) => {
                const result = await createBuilderInlineAction(name);
                return result;
              }}
              onCreated={({ id, name }) => {
                setBuilderOptions((prev) => [...prev, { id, name }]);
                setSelectedBuilderId(id);
              }}
            />
          </div>
          <Field label="Developer group (optional)" name="developerGroup" defaultValue={project?.developerGroup ?? ""} placeholder="SPV / holding entity, if different" />
        </FieldGroup>
        <FieldGroup>
          <SelectField label="Status" name="status" required defaultValue={project?.status ?? ""}>
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
          <SelectField label="Category" name="category" required defaultValue={project?.category ?? ""}>
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
        <TextareaField
          label="Highlights (one per line)"
          name="highlights"
          defaultValue={project?.highlights.join("\n") ?? ""}
          placeholder={"5 min walk to metro\nSea-facing corner units\nRERA registered"}
          hint="Short bullet differentiators shown near the top of the detail page"
        />
      </div>

      <div className={activeTab === "location" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <div>
            <SelectField
              label="Locality"
              name="localityId"
              required
              value={selectedLocalityId}
              onChange={(e) => setSelectedLocalityId(e.target.value)}
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
              }}
            />
          </div>
          <SelectField label="Micro market (optional)" name="microMarketId" defaultValue={project?.microMarketId ?? ""}>
            <option value="">
              {microMarketOptions.length === 0 ? "None catalogued for this locality" : "None"}
            </option>
            {microMarketOptions.map((mm) => (
              <option key={mm.id} value={mm.id}>
                {mm.name}
              </option>
            ))}
          </SelectField>
        </FieldGroup>
        <Field label="Address" name="address" defaultValue={project?.address ?? ""} />
        <FieldGroup>
          <Field label="Latitude" name="latitude" type="number" step="any" defaultValue={project?.latitude ?? ""} />
          <Field label="Longitude" name="longitude" type="number" step="any" defaultValue={project?.longitude ?? ""} />
        </FieldGroup>
        <MapEmbed latitude={lat} longitude={lng} />
      </div>

      <div className={activeTab === "pricing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field
            label="Price min (₹)"
            name="priceMinRupees"
            type="number"
            step="any"
            defaultValue={project?.priceMinPaise !== null && project?.priceMinPaise !== undefined ? Number(project.priceMinPaise) / 100 : ""}
            placeholder="e.g. 45000000 for ₹4.5 Cr"
          />
          <Field
            label="Price max (₹)"
            name="priceMaxRupees"
            type="number"
            step="any"
            defaultValue={project?.priceMaxPaise !== null && project?.priceMaxPaise !== undefined ? Number(project.priceMaxPaise) / 100 : ""}
          />
        </FieldGroup>
        <FieldGroup>
          <Field label="RERA number" name="reraNumber" defaultValue={project?.reraNumber ?? ""} />
          <Field label="RERA status" name="reraStatus" defaultValue={project?.reraStatus ?? ""} />
        </FieldGroup>
      </div>

      <div className={activeTab === "construction" ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Launch date" name="launchDate" type="date" defaultValue={toDateInputValue(project?.launchDate ?? null)} />
          <Field label="Promised possession" name="promisedPossession" type="date" defaultValue={toDateInputValue(project?.promisedPossession ?? null)} />
          <Field label="Actual possession" name="actualPossession" type="date" defaultValue={toDateInputValue(project?.actualPossession ?? null)} />
        </div>
        <FieldGroup>
          <Field label="Construction complete (%)" name="constructionPercent" type="number" min={0} max={100} defaultValue={project?.constructionPercent ?? ""} />
          <Field label="Land area (acres)" name="landAreaAcres" type="number" step="any" defaultValue={project?.landAreaAcres ?? ""} />
        </FieldGroup>
        <FieldGroup>
          <Field label="Total units" name="totalUnits" type="number" min={0} defaultValue={project?.totalUnits ?? ""} />
          <Field label="Total towers" name="totalTowers" type="number" min={0} defaultValue={project?.totalTowers ?? ""} />
        </FieldGroup>
      </div>

      <div className={activeTab === "amenities" ? "flex flex-col gap-4" : "hidden"}>
        <AmenitiesPicker amenities={amenities} defaultSelectedIds={project?.amenityIds ?? []} />
      </div>

      <div className={activeTab === "description" ? "flex flex-col gap-4" : "hidden"}>
        <RichTextEditor label="Description" name="description" defaultValue={project?.description ?? ""} />
      </div>

      <div className={activeTab === "media" ? "flex flex-col gap-4" : "hidden"}>
        <Field label="Video URL" name="videoUrl" type="url" defaultValue={project?.videoUrl ?? ""} placeholder="YouTube / Vimeo link" />
        <Field label="360° tour URL" name="tour360Url" type="url" defaultValue={project?.tour360Url ?? ""} />
        {project ? (
          <p className="text-xs text-muted">
            Cover Image, Gallery, Floor Plans, Master Plan, the Project Brochure and Documents are each managed in
            their own card below, after this form — every save there is independent of this form. Configurations,
            specifications, nearby places, custom sections, the construction timeline and FAQs each have their own
            card too.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">Project brochure (optional, PDF)</span>
              <input
                type="file"
                name="brochureFile"
                accept="application/pdf"
                onChange={(e) => setBrochureFileName(e.target.files?.[0]?.name ?? null)}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-2.5 file:py-1 file:text-xs file:font-mono file:font-semibold file:uppercase file:text-white"
              />
              <span className="text-[10px] text-muted">
                {brochureFileName ? `${brochureFileName} will upload once you save.` : "Uploaded when you save this project — no need to come back to the edit page just for the brochure."}
              </span>
            </label>
            <div className="rounded-sm border border-dashed border-border p-4 text-xs text-muted">
              <p>Cover Image, Gallery, Floor Plans, Master Plan and Documents need the project saved first — each gets its own card on the edit page:</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {["Cover Image", "Gallery", "Floor Plans", "Master Plan", "Documents"].map((label) => (
                  <li key={label} className="rounded-sm border border-border bg-surface px-2 py-1 text-[10px] font-mono uppercase tracking-wide">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      <div className={activeTab === "seo" ? "flex flex-col gap-4" : "hidden"}>
        <Field
          label="Meta title"
          name="metaTitle"
          maxLength={70}
          defaultValue={project?.metaTitle ?? ""}
          placeholder="Defaults to the project name"
          hint="Up to 70 characters — shown as the browser tab / search result title"
        />
        <Field
          label="Meta description"
          name="metaDescription"
          maxLength={160}
          defaultValue={project?.metaDescription ?? ""}
          placeholder="Defaults to the tagline"
          hint="Up to 160 characters — shown as the search result snippet"
        />
        <Field
          label="Social share image URL (og:image)"
          name="ogImageUrl"
          type="url"
          defaultValue={project?.ogImageUrl ?? ""}
          placeholder="Defaults to the hero image"
        />
      </div>

      <div className={activeTab === "publishing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <CheckboxField label="Published — visible on the public site" name="isPublished" defaultChecked={project?.isPublished ?? false} hint="Leave unchecked to keep this a draft" />
          <CheckboxField label="Featured — spotlighted placement" name="isFeatured" defaultChecked={project?.isFeatured ?? false} />
        </FieldGroup>
        <FieldGroup>
          <CheckboxField label="Trending" name="isTrending" defaultChecked={project?.isTrending ?? false} />
          <CheckboxField label="Luxury" name="isLuxury" defaultChecked={project?.isLuxury ?? false} />
        </FieldGroup>
        <CheckboxField label="Affordable" name="isAffordable" defaultChecked={project?.isAffordable ?? false} />
        <FieldGroup>
          <SelectField label="Data source" name="dataSource" defaultValue={project?.dataSource ?? "MANUALLY_VERIFIED"}>
            {DATA_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Confidence" name="confidence" defaultValue={project?.confidence ?? "HIGH"}>
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </SelectField>
        </FieldGroup>
        <Field label="Source reference" name="sourceRef" defaultValue={project?.sourceRef ?? ""} />
      </div>

      <div>
        <SubmitButton>{project ? (project.isPublished ? "Save changes" : "Save Draft") : "Save Draft"}</SubmitButton>
      </div>
    </form>
  );
}
