"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createBuilderAction, updateBuilderAction, type BuilderFormState } from "@/lib/actions/builders";
import { CONFIDENCE_LEVELS, DATA_SOURCES, SOURCE_LABEL } from "@/lib/project-meta";
import { CheckboxField, Field, FieldGroup, FormError, SelectField, TextareaField } from "./FormField";
import SingleImageUploadField from "./SingleImageUploadField";
import RichTextEditor from "./RichTextEditor";
import FormTabs, { type FormTab } from "./FormTabs";
import AmenitiesPicker, { type AmenityOption } from "./AmenitiesPicker";
import SubmitButton from "./SubmitButton";

export interface BuilderFormData {
  id: string;
  slug: string;
  name: string;
  legalNames: string[];
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  foundedYear: number | null;
  headquarters: string | null;
  websiteUrl: string | null;
  reraNumber: string | null;
  awards: string[];
  dataSource: string;
  confidence: string;
  isPublished: boolean;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  amenityIds: string[];
}

const initialState: BuilderFormState = {};

const TABS: FormTab[] = [
  { id: "general", label: "General" },
  { id: "media", label: "Media" },
  { id: "description", label: "Description" },
  { id: "amenities", label: "Amenities" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
];

export default function BuilderForm({ builder, amenities }: { builder?: BuilderFormData; amenities: AmenityOption[] }) {
  const action = builder ? updateBuilderAction.bind(null, builder.id) : createBuilderAction;
  const [state, formAction] = useActionState(action, initialState);
  const [activeTab, setActiveTab] = useState("general");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className={activeTab === "general" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Name" name="name" required defaultValue={builder?.name} placeholder="Lodha Group" />
          <Field label="Slug (optional)" name="slug" defaultValue={builder?.slug} placeholder="auto-generated from name" />
        </FieldGroup>

        <FieldGroup>
          <Field label="Headquarters" name="headquarters" defaultValue={builder?.headquarters ?? ""} placeholder="Mumbai, India" />
          <Field label="Founded year" name="foundedYear" type="number" defaultValue={builder?.foundedYear ?? ""} />
        </FieldGroup>

        <FieldGroup>
          <Field label="Website" name="websiteUrl" type="url" defaultValue={builder?.websiteUrl ?? ""} placeholder="https://..." />
          <Field label="RERA number" name="reraNumber" defaultValue={builder?.reraNumber ?? ""} />
        </FieldGroup>

        <TextareaField
          label="Legal names (one per line, optional)"
          name="legalNames"
          defaultValue={builder?.legalNames.join("\n") ?? ""}
          placeholder={"Lodha Developers Pvt Ltd\nMacrotech Developers Ltd"}
          hint="Subsidiary / SPV legal names resolved to this economic builder"
        />

        <TextareaField
          label="Awards (one per line)"
          name="awards"
          defaultValue={builder?.awards.join("\n") ?? ""}
          placeholder={"Best Developer 2025 — CREDAI\nExcellence in Sustainability — MahaRERA"}
        />

        <FieldGroup>
          <SelectField label="Data source" name="dataSource" defaultValue={builder?.dataSource ?? "MANUALLY_VERIFIED"}>
            {DATA_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Confidence" name="confidence" defaultValue={builder?.confidence ?? "HIGH"}>
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </SelectField>
        </FieldGroup>
      </div>

      <div className={activeTab === "media" ? "flex flex-col gap-4" : "hidden"}>
        <SingleImageUploadField name="logoUrl" label="Logo" defaultValue={builder?.logoUrl} />
        <SingleImageUploadField name="coverImageUrl" label="Cover image (profile banner)" defaultValue={builder?.coverImageUrl} />
        {builder ? (
          <p className="text-xs text-muted">A multi-image gallery is available below, after this form.</p>
        ) : (
          <p className="rounded-sm border border-dashed border-border p-4 text-xs text-muted">
            Save the builder first — the gallery upload is available from the edit page.
          </p>
        )}
      </div>

      <div className={activeTab === "description" ? "flex flex-col gap-4" : "hidden"}>
        <RichTextEditor label="Description" name="description" defaultValue={builder?.description ?? ""} />
      </div>

      <div className={activeTab === "amenities" ? "flex flex-col gap-4" : "hidden"}>
        <p className="text-xs text-muted">Facilities and offerings this builder is known for.</p>
        <AmenitiesPicker amenities={amenities} defaultSelectedIds={builder?.amenityIds ?? []} />
      </div>

      <div className={activeTab === "seo" ? "flex flex-col gap-4" : "hidden"}>
        <Field
          label="Meta title"
          name="metaTitle"
          maxLength={70}
          defaultValue={builder?.metaTitle ?? ""}
          placeholder="Defaults to the builder name"
          hint="Up to 70 characters — shown as the browser tab / search result title"
        />
        <Field
          label="Meta description"
          name="metaDescription"
          maxLength={160}
          defaultValue={builder?.metaDescription ?? ""}
          placeholder="Defaults to the description"
          hint="Up to 160 characters — shown as the search result snippet"
        />
        <Field
          label="Social share image URL (og:image)"
          name="ogImageUrl"
          type="url"
          defaultValue={builder?.ogImageUrl ?? ""}
          placeholder="Defaults to the cover image"
        />
      </div>

      <div className={activeTab === "publishing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <CheckboxField label="Published — visible on the public site" name="isPublished" defaultChecked={builder?.isPublished ?? false} hint="Leave unchecked to keep this a draft" />
          <CheckboxField label="Featured — spotlighted on the homepage" name="isFeatured" defaultChecked={builder?.isFeatured ?? false} />
        </FieldGroup>
      </div>

      <div>
        <SubmitButton>{builder ? "Save changes" : "Create builder"}</SubmitButton>
      </div>
    </form>
  );
}
