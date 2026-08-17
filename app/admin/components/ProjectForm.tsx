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
  PAYMENT_PLAN_TYPES,
  PAYMENT_PLAN_TYPE_DEFAULT_DESCRIPTION,
  PAYMENT_PLAN_TYPE_LABEL,
  POSSESSION_MONTH_LABEL,
  PROJECT_STATUSES,
  PROPERTY_CATEGORIES,
  SOURCE_LABEL,
  STATUS_LABEL,
  type PaymentPlanType,
} from "@/lib/project-meta";
import { formatBytes, formatPaise } from "@/lib/format";
import { compressPdfFile } from "@/lib/pdf-compress";
import { CheckboxField, Field, FieldGroup, FormError, SelectField, TextareaField } from "./FormField";
import RichTextEditor from "./RichTextEditor";
import SubmitButton from "./SubmitButton";
import FormTabs, { type FormTab } from "./FormTabs";
import MapEmbed from "./MapEmbed";
import AmenitiesPicker, { type AmenityOption } from "./AmenitiesPicker";
import InlineEntityCreate from "./InlineEntityCreate";
import ProjectReviewModal, { type ReviewSection } from "./ProjectReviewModal";
import { createBuilderInlineAction } from "@/lib/actions/builders";
import { createLocalityInlineAction } from "@/lib/actions/localities";
import { createMicroMarketInlineAction } from "@/lib/actions/micromarkets";
import type { ConfigurationRow } from "./ConfigurationsManager";
import type { SpecificationRow } from "./SpecificationsManager";
import type { NearbyLinkRow } from "./NearbyPlacesManager";
import type { ProjectTimelineRow } from "./ProjectTimelineManager";
import type { FaqRow } from "./ProjectFaqsManager";
import type { SectionRow } from "./ProjectSectionsManager";
import type { ProjectDocumentRow } from "./DocumentsManager";
import ProgressIndicator from "./ProgressIndicator";
import CoverImageUploader from "./CoverImageUploader";
import type { ProjectImageItem } from "./ImageUploader";
import PriceAmountField from "./PriceAmountField";
import { rupeesToAmountUnit, amountUnitToRupees, type PriceUnit } from "@/lib/price-units";

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
  googleMapsUrl: string | null;
  launchDate: Date | null;
  promisedPossession: Date | null;
  actualPossession: Date | null;
  possessionMonth: number | null;
  possessionYear: number | null;
  constructionPercent: number | null;
  reraNumber: string | null;
  reraStatus: string | null;
  reraCertificateUrl: string | null;
  totalUnits: number | null;
  totalTowers: number | null;
  landAreaAcres: number | null;
  priceMinPaise: bigint | null;
  priceMaxPaise: bigint | null;
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

/**
 * Extracts lat/lng from a pasted Google Maps link so the OSM MapEmbed preview
 * and infra-linking distance calculations keep working without the admin
 * ever typing coordinates by hand. Tries the common share-link shapes in
 * order; returns null (not thrown) for shortened links (goo.gl/maps/…) that
 * don't expose coordinates — the admin just won't get a map preview for those.
 */
function parseLatLngFromGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  }
  return null;
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
  builders: SelectOption[];
  amenities: AmenityOption[];
  /** Images live in a separate table, not this form's own fields — passed in so CoverImageUploader/ImageUploader and the Media section's completion count work correctly. Always empty for a not-yet-created project. */
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
  const [activeTab, setActiveTab] = useState("general");
  const [progress, setProgress] = useState(project?.completionPercent ?? 0);
  const [underReview, setUnderReview] = useState(Boolean(project?.submittedForReviewAt));
  const [isReviewPending, startReviewTransition] = useTransition();
  const [isPublishing, startPublishTransition] = useTransition();
  const router = useRouter();
  const [lat, setLat] = useState<number | null>(project?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(project?.longitude ?? null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState(project?.googleMapsUrl ?? "");
  // Only updates lat/lng when the pasted link actually parses — never clears
  // previously-detected coordinates just because a mid-edit link is momentarily unparseable.
  function handleGoogleMapsUrlChange(value: string) {
    setGoogleMapsUrl(value);
    const coords = parseLatLngFromGoogleMapsUrl(value);
    if (coords) {
      setLat(coords.lat);
      setLng(coords.lng);
    }
  }
  const [localityOptions, setLocalityOptions] = useState(localities);
  const [builderOptions, setBuilderOptions] = useState(builders);
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
  // Native <input type="date"> pickers make jumping back to an old year painful (repeated
  // stepper clicks / month-by-month calendar navigation) -- this companion Year select lets
  // the admin land on e.g. 2005 in one click, updating the same underlying date value.
  const [launchDate, setLaunchDate] = useState(toDateInputValue(project?.launchDate ?? null));
  const launchDateYearOptions = Array.from({ length: new Date().getFullYear() + 2 - 2000 + 1 }, (_, i) => 2000 + i).reverse();
  const [paymentPlanType, setPaymentPlanType] = useState(project?.paymentPlanType ?? "");
  const [paymentPlanDescription, setPaymentPlanDescription] = useState(project?.paymentPlanDescription ?? "");
  const initialPriceMin = rupeesToAmountUnit(project?.priceMinPaise !== null && project?.priceMinPaise !== undefined ? Number(project.priceMinPaise) / 100 : null);
  const initialPriceMax = rupeesToAmountUnit(project?.priceMaxPaise !== null && project?.priceMaxPaise !== undefined ? Number(project.priceMaxPaise) / 100 : null);
  const [priceMinAmount, setPriceMinAmount] = useState(initialPriceMin.amount);
  const [priceMinUnit, setPriceMinUnit] = useState<PriceUnit>(initialPriceMin.unit);
  const [priceMaxAmount, setPriceMaxAmount] = useState(initialPriceMax.amount);
  const [priceMaxUnit, setPriceMaxUnit] = useState<PriceUnit>(initialPriceMax.unit);
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
    const priceMax = g("priceMaxRupees");

    setReviewSections([
      {
        title: "General",
        rows: [
          { label: "Name", value: g("name"), important: true },
          { label: "Slug", value: g("slug") },
          { label: "Tagline", value: g("tagline") },
          { label: "Builder", value: builderName || "No builder" },
          { label: "Developer group", value: g("developerGroup") },
          { label: "Status", value: g("status") ? label(STATUS_LABEL, g("status")) : "" },
          { label: "Category", value: g("category") ? label(CATEGORY_LABEL, g("category")) : "" },
          { label: "Highlights", value: highlightsCount ? `${highlightsCount} listed` : "" },
        ],
      },
      {
        title: "Location",
        rows: [
          { label: "Locality", value: localityName, important: true },
          { label: "Micro market", value: microMarketName },
          { label: "Address", value: g("address"), important: true },
          { label: "Google Maps Link", value: g("googleMapsUrl") ? "Provided" : "" },
        ],
      },
      {
        title: "Pricing",
        rows: [
          { label: "Price min", value: priceMin ? formatPaise(Number(priceMin) * 100) : "", important: true },
          { label: "Price max", value: priceMax ? formatPaise(Number(priceMax) * 100) : "" },
          { label: "RERA number", value: g("reraNumber"), important: true },
          { label: "RERA status", value: g("reraStatus") },
          { label: "RERA certificate link", value: g("reraCertificateUrl") ? "Provided" : "" },
          {
            label: "Payment plan",
            value: g("paymentPlanType") ? label(PAYMENT_PLAN_TYPE_LABEL, g("paymentPlanType")) : "",
          },
        ],
      },
      {
        title: "Construction",
        rows: [
          { label: "Launch date", value: g("launchDate"), important: true },
          {
            label: "Possession",
            value: g("possessionMonth") && g("possessionYear") ? `${POSSESSION_MONTH_LABEL[Number(g("possessionMonth"))]} ${g("possessionYear")}` : "",
          },
          { label: "Actual possession", value: g("actualPossession") },
          { label: "Construction complete", value: g("constructionPercent") ? `${g("constructionPercent")}%` : "" },
          { label: "Land area", value: g("landAreaAcres") ? `${g("landAreaAcres")} acres` : "" },
          { label: "Total units", value: g("totalUnits"), important: true },
          { label: "Total towers", value: g("totalTowers") },
        ],
      },
      {
        title: "Amenities",
        rows: [{ label: "Selected", value: amenityCount ? `${amenityCount} amenities` : "", important: true }],
      },
      {
        title: "Description",
        rows: [{ label: "Description", value: g("description") ? "Provided" : "", important: true }],
      },
      {
        title: "Media",
        rows: [
          { label: "Video URL", value: g("videoUrl") },
          { label: "360° tour URL", value: g("tour360Url") },
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
        title: "SEO",
        rows: [
          { label: "Meta title", value: g("metaTitle"), important: true },
          { label: "Meta description", value: g("metaDescription"), important: true },
          { label: "OG image URL", value: g("ogImageUrl") },
        ],
      },
      {
        title: "Publishing",
        rows: [
          { label: "Published", value: data.get("isPublished") === "on" ? "Yes" : "No", important: true },
          { label: "Featured", value: data.get("isFeatured") === "on" ? "Yes" : "No" },
          { label: "Trending", value: data.get("isTrending") === "on" ? "Yes" : "No" },
          { label: "Luxury", value: data.get("isLuxury") === "on" ? "Yes" : "No" },
          { label: "Affordable", value: data.get("isAffordable") === "on" ? "Yes" : "No" },
          { label: "Data source", value: g("dataSource") ? label(SOURCE_LABEL, g("dataSource")) : "" },
          { label: "Confidence", value: g("confidence") },
          { label: "Source reference", value: g("sourceRef") },
        ],
      },
    ]);
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
        Fields marked <span className="text-negative">*</span> are important. If the information genuinely isn&apos;t
        available yet, type <span className="font-mono text-foreground">NA</span> instead of leaving it blank.
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
                      await togglePublishAction(project.id, true);
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
      </div>

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className={activeTab === "general" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Name" name="name" important defaultValue={project?.name} placeholder="Lodha Park" />
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
        </FieldGroup>
        <Field label="Address" name="address" important defaultValue={project?.address ?? ""} />
        <Field
          label="Google Maps Link"
          name="googleMapsUrl"
          type="url"
          value={googleMapsUrl}
          onChange={(e) => handleGoogleMapsUrlChange(e.target.value)}
          placeholder="Open the site in Google Maps → Share → Copy link, then paste it here"
          hint={
            lat !== null && lng !== null
              ? `Coordinates detected: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
              : "Shown as a direct \"View on Google Maps\" link for users — coordinates for the map preview below are picked up automatically when the link contains them"
          }
        />
        <input type="hidden" name="latitude" value={lat ?? ""} />
        <input type="hidden" name="longitude" value={lng ?? ""} />
        <MapEmbed latitude={lat} longitude={lng} />
      </div>

      <div className={activeTab === "pricing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <PriceAmountField
            label="Price min"
            name="priceMinRupees"
            important
            amount={priceMinAmount}
            unit={priceMinUnit}
            onAmountChange={setPriceMinAmount}
            onUnitChange={setPriceMinUnit}
            rupees={amountUnitToRupees(priceMinAmount, priceMinUnit)}
          />
          <PriceAmountField
            label="Price max"
            name="priceMaxRupees"
            amount={priceMaxAmount}
            unit={priceMaxUnit}
            onAmountChange={setPriceMaxAmount}
            onUnitChange={setPriceMaxUnit}
            rupees={amountUnitToRupees(priceMaxAmount, priceMaxUnit)}
          />
        </FieldGroup>
        <FieldGroup>
          <Field label="RERA number" name="reraNumber" important defaultValue={project?.reraNumber ?? ""} />
          <Field label="RERA status" name="reraStatus" defaultValue={project?.reraStatus ?? ""} />
        </FieldGroup>
        <Field
          label="RERA Certificate Link"
          name="reraCertificateUrl"
          type="url"
          defaultValue={project?.reraCertificateUrl ?? ""}
          placeholder="Link to this project's registration on the official MahaRERA site"
          hint="Shown as a direct link on the Project Detail Page — the government record of this project's RERA commitment, not just the number"
        />
        <SelectField
          label="Payment Plan Type"
          name="paymentPlanType"
          value={paymentPlanType}
          onChange={(e) => {
            const next = e.target.value as PaymentPlanType | "";
            setPaymentPlanType(next);
            // Auto-fills the description with a sensible default — still just a starting
            // value in a normal textarea, so the admin can edit it (e.g. the actual
            // "10:80:10" split) without it fighting back on every keystroke.
            if (next && !paymentPlanDescription.trim()) {
              setPaymentPlanDescription(PAYMENT_PLAN_TYPE_DEFAULT_DESCRIPTION[next]);
            }
          }}
        >
          <option value="">Not set</option>
          {PAYMENT_PLAN_TYPES.map((type) => (
            <option key={type} value={type}>
              {PAYMENT_PLAN_TYPE_LABEL[type]}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label="Payment Plan Description"
          name="paymentPlanDescription"
          value={paymentPlanDescription}
          onChange={(e) => setPaymentPlanDescription(e.target.value)}
          placeholder="Shown in the Payment Plan info tooltip on the Project Card and detail page"
          hint="Auto-filled from the selected type — edit freely, e.g. to record the actual split (10:80:10)"
        />
      </div>

      <div className={activeTab === "construction" ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Field
              label="Launch date"
              name="launchDate"
              type="date"
              important
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted">Jump to year</span>
              <select
                value={launchDate ? launchDate.slice(0, 4) : ""}
                onChange={(e) => {
                  const year = e.target.value;
                  if (!year) return;
                  const [, month, day] = (launchDate || "-01-01").split("-");
                  setLaunchDate(`${year}-${month || "01"}-${day || "01"}`);
                }}
                className="rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="">Select year…</option>
                {launchDateYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Field label="Actual possession" name="actualPossession" type="date" defaultValue={toDateInputValue(project?.actualPossession ?? null)} />
        </div>
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
            {" · "}Shown as-is on the Project Card, Project Detail Page, search results and Featured Projects — no
            quarters, ever.
          </p>
        </div>
        <FieldGroup>
          <Field label="Construction complete (%)" name="constructionPercent" type="number" min={0} max={100} defaultValue={project?.constructionPercent ?? ""} />
          <Field label="Land area (acres)" name="landAreaAcres" type="number" step="any" defaultValue={project?.landAreaAcres ?? ""} />
        </FieldGroup>
        <FieldGroup>
          <Field label="Total units" name="totalUnits" type="number" min={0} important defaultValue={project?.totalUnits ?? ""} />
          <Field label="Total towers" name="totalTowers" type="number" min={0} defaultValue={project?.totalTowers ?? ""} />
        </FieldGroup>
      </div>

      <div className={activeTab === "amenities" ? "flex flex-col gap-4" : "hidden"}>
        <p className="text-[11px] text-muted">
          <span className="text-negative">*</span> Important — select at least one amenity, or add a project-specific
          one below if it&apos;s not in the list yet.
        </p>
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

      <div className={activeTab === "description" ? "flex flex-col gap-4" : "hidden"}>
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
      </div>

      <div className={activeTab === "media" ? "flex flex-col gap-4" : "hidden"}>
        {project ? (
          <CoverImageUploader projectId={project.id} images={images} />
        ) : (
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

        <Field label="Video URL" name="videoUrl" type="url" defaultValue={project?.videoUrl ?? ""} placeholder="YouTube / Vimeo link" />
        <Field label="360° tour URL" name="tour360Url" type="url" defaultValue={project?.tour360Url ?? ""} />
        {project ? (
          <p className="text-xs text-muted">
            Gallery, Floor Plans, Master Plan, the Project Brochure and Documents are each managed in their own card
            below, after this form — every save there is independent of this form. Configurations, specifications,
            nearby places, custom sections, the construction timeline and FAQs each have their own card too.
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
      </div>

      <div className={activeTab === "seo" ? "flex flex-col gap-4" : "hidden"}>
        <Field
          label="Meta title"
          name="metaTitle"
          maxLength={70}
          important
          defaultValue={project?.metaTitle ?? ""}
          placeholder="Defaults to the project name"
          hint="Up to 70 characters — shown as the browser tab / search result title"
        />
        <Field
          label="Meta description"
          name="metaDescription"
          maxLength={160}
          important
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
          actions={<SubmitButton>{project ? (project.isPublished ? "Save changes" : "Save Draft") : "Save Draft"}</SubmitButton>}
        />
      ) : null}
    </form>
  );
}
