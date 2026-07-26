"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { autosaveProjectAction, createProjectAction, updateProjectAction, type ProjectFormState } from "@/lib/actions/projects";
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

const REQUIRED_PROGRESS_FIELDS = [
  "name",
  "localityId",
  "status",
  "category",
  "description",
  "tagline",
  "address",
  "priceMinRupees",
  "launchDate",
  "totalUnits",
  "reraNumber",
  "metaTitle",
];

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default function ProjectForm({
  project,
  localities,
  builders,
  amenities,
}: {
  project?: ProjectFormData;
  localities: LocalityOption[];
  builders: SelectOption[];
  amenities: AmenityOption[];
}) {
  const action = project ? updateProjectAction.bind(null, project.id) : createProjectAction;
  const [state, formAction] = useActionState(action, initialState);
  const [activeTab, setActiveTab] = useState("general");
  const [progress, setProgress] = useState(0);
  const [lat, setLat] = useState<number | null>(project?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(project?.longitude ?? null);
  const [selectedLocalityId, setSelectedLocalityId] = useState(project?.localityId ?? "");
  const microMarketOptions = localities.find((l) => l.id === selectedLocalityId)?.microMarkets ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, startAutosaveTransition] = useTransition();

  function recomputeProgress() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    let filled = 0;
    for (const key of REQUIRED_PROGRESS_FIELDS) {
      const value = data.get(key);
      if (value && String(value).trim().length > 0) filled += 1;
    }
    setProgress(Math.round((filled / REQUIRED_PROGRESS_FIELDS.length) * 100));
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

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange} onBlur={scheduleAutosave} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProgressIndicator percent={progress} />
        {project ? (
          <span className="font-mono text-[10px] text-muted">
            {autosaveStatus === "saving" ? "Saving draft…" : autosaveStatus === "saved" ? "Draft autosaved" : "Autosave on blur"}
          </span>
        ) : null}
      </div>

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className={activeTab === "general" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Name" name="name" required defaultValue={project?.name} placeholder="Lodha Park" />
          <Field label="Slug (optional)" name="slug" defaultValue={project?.slug} placeholder="auto-generated from name" />
        </FieldGroup>
        <Field label="Tagline" name="tagline" defaultValue={project?.tagline ?? ""} placeholder="One-line pitch" />
        <FieldGroup>
          <SelectField label="Builder (optional)" name="builderId" defaultValue={project?.builderId ?? ""}>
            <option value="">No builder</option>
            {builders.map((builder) => (
              <option key={builder.id} value={builder.id}>
                {builder.name}
              </option>
            ))}
          </SelectField>
          <Field label="Developer group (optional)" name="developerGroup" defaultValue={project?.developerGroup ?? ""} placeholder="SPV / holding entity, if different" />
        </FieldGroup>
        <FieldGroup>
          <SelectField label="Status" name="status" defaultValue={project?.status ?? "ANNOUNCED"}>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" name="category" defaultValue={project?.category ?? "RESIDENTIAL"}>
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
          <SelectField
            label="Locality"
            name="localityId"
            required
            defaultValue={project?.localityId ?? ""}
            onChange={(e) => setSelectedLocalityId(e.target.value)}
          >
            <option value="" disabled>
              Select a locality
            </option>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.name}
              </option>
            ))}
          </SelectField>
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
            Images, documents and the brochure PDF are managed in the cards below, after this form. Configurations,
            specifications, nearby places, custom sections, the construction timeline and FAQs each have their own
            card too — every save there is independent of this form.
          </p>
        ) : (
          <p className="rounded-sm border border-dashed border-border p-4 text-xs text-muted">
            Save the project first — image gallery, documents and brochure upload are available from the edit page.
          </p>
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
        <SubmitButton>{project ? "Save changes" : "Create project"}</SubmitButton>
      </div>
    </form>
  );
}
