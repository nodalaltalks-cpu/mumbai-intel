"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createLocalityAction, updateLocalityAction, type LocalityFormState } from "@/lib/actions/localities";
import { CheckboxField, Field, FieldGroup, FormError, SelectField, TextareaField } from "./FormField";
import SingleImageUploadField from "./SingleImageUploadField";
import RichTextEditor from "./RichTextEditor";
import FormTabs, { type FormTab } from "./FormTabs";
import AmenitiesPicker, { type AmenityOption } from "./AmenitiesPicker";
import SubmitButton from "./SubmitButton";

export interface LocalityFormData {
  id: string;
  slug: string;
  name: string;
  zoneId: string | null;
  pincode: string | null;
  description: string | null;
  coverImageUrl: string | null;
  centroidLat: number | null;
  centroidLng: number | null;
  avgPricePerSqftPaise: bigint | null;
  rentalYieldPercent: number | string | null;
  growthPercentYoy: number | string | null;
  connectivityNotes: string | null;
  investmentScore: number | string | null;
  endUserScore: number | string | null;
  luxuryScore: number | string | null;
  familyScore: number | string | null;
  advantages: string[];
  disadvantages: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  amenityIds: string[];
}

export interface ZoneOption {
  id: string;
  name: string;
}

const initialState: LocalityFormState = {};

const TABS: FormTab[] = [
  { id: "general", label: "General" },
  { id: "media", label: "Media" },
  { id: "market", label: "Market Data" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "insights", label: "Insights" },
  { id: "amenities", label: "Amenities" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
];

export default function LocalityForm({
  locality,
  zones,
  amenities,
}: {
  locality?: LocalityFormData;
  zones: ZoneOption[];
  amenities: AmenityOption[];
}) {
  const action = locality ? updateLocalityAction.bind(null, locality.id) : createLocalityAction;
  const [state, formAction] = useActionState(action, initialState);
  const [activeTab, setActiveTab] = useState("general");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <FormTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div className={activeTab === "general" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Name" name="name" required defaultValue={locality?.name} placeholder="Bandra West" />
          <Field label="Slug (optional)" name="slug" defaultValue={locality?.slug} placeholder="auto-generated from name" />
        </FieldGroup>

        <FieldGroup>
          <SelectField label="Zone" name="zoneId" defaultValue={locality?.zoneId ?? ""}>
            <option value="">No zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </SelectField>
          <Field label="Pincode" name="pincode" defaultValue={locality?.pincode ?? ""} placeholder="400050" />
        </FieldGroup>

        <FieldGroup>
          <Field label="Centroid latitude" name="centroidLat" type="number" step="any" defaultValue={locality?.centroidLat ?? ""} />
          <Field label="Centroid longitude" name="centroidLng" type="number" step="any" defaultValue={locality?.centroidLng ?? ""} />
        </FieldGroup>
        <p className="text-[11px] text-muted">
          City is fixed to Mumbai (the only live city). Coordinates drive the automatic &quot;nearby infrastructure&quot;
          computation and the map on the public page. Micro markets within this locality are managed below, after this
          form.
        </p>

        <RichTextEditor label="Description" name="description" defaultValue={locality?.description ?? ""} />
      </div>

      <div className={activeTab === "media" ? "flex flex-col gap-4" : "hidden"}>
        <SingleImageUploadField name="coverImageUrl" label="Cover image" defaultValue={locality?.coverImageUrl} />
        {locality ? (
          <p className="text-xs text-muted">A multi-image gallery is available below, after this form.</p>
        ) : (
          <p className="rounded-sm border border-dashed border-border p-4 text-xs text-muted">
            Save the locality first — the gallery upload is available from the edit page.
          </p>
        )}
      </div>

      <div className={activeTab === "market" ? "flex flex-col gap-4" : "hidden"}>
        <p className="text-xs text-muted">
          Total transactions, sales volume, ticket size, median price and the price trend chart are computed live from
          registered transactions — nothing to enter here.
        </p>
        <FieldGroup>
          <Field
            label="Avg price (₹/sqft)"
            name="avgPriceRupeesPerSqft"
            type="number"
            step="any"
            min={0}
            defaultValue={locality?.avgPricePerSqftPaise !== null && locality?.avgPricePerSqftPaise !== undefined ? Number(locality.avgPricePerSqftPaise) / 100 : ""}
          />
          <Field label="Rental yield (%)" name="rentalYieldPercent" type="number" step="any" min={0} max={100} defaultValue={locality?.rentalYieldPercent ?? ""} />
        </FieldGroup>
        <Field
          label="YoY growth (%)"
          name="growthPercentYoy"
          type="number"
          step="any"
          defaultValue={locality?.growthPercentYoy ?? ""}
          hint="Positive or negative — appreciation over the last 12 months"
        />
      </div>

      <div className={activeTab === "lifestyle" ? "flex flex-col gap-4" : "hidden"}>
        <p className="text-xs text-muted">
          Schools, hospitals, metro/railway stations, malls, parks, restaurants and airport distance are computed
          automatically from catalogued infrastructure near this locality&apos;s coordinates — shown below, after this
          form. Add a summary of overall connectivity here.
        </p>
        <TextareaField
          label="Connectivity notes"
          name="connectivityNotes"
          defaultValue={locality?.connectivityNotes ?? ""}
          placeholder="Well connected via the Western Express Highway and the Andheri–Ghatkopar Link Road."
        />
      </div>

      <div className={activeTab === "insights" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <Field label="Investment score (0-10)" name="investmentScore" type="number" step="0.1" min={0} max={10} defaultValue={locality?.investmentScore ?? ""} />
          <Field label="End-user score (0-10)" name="endUserScore" type="number" step="0.1" min={0} max={10} defaultValue={locality?.endUserScore ?? ""} />
        </FieldGroup>
        <FieldGroup>
          <Field label="Luxury score (0-10)" name="luxuryScore" type="number" step="0.1" min={0} max={10} defaultValue={locality?.luxuryScore ?? ""} />
          <Field label="Family score (0-10)" name="familyScore" type="number" step="0.1" min={0} max={10} defaultValue={locality?.familyScore ?? ""} />
        </FieldGroup>
        <TextareaField
          label="Advantages (one per line)"
          name="advantages"
          defaultValue={locality?.advantages.join("\n") ?? ""}
          placeholder={"Excellent metro connectivity\nStrong rental demand"}
        />
        <TextareaField
          label="Disadvantages (one per line)"
          name="disadvantages"
          defaultValue={locality?.disadvantages.join("\n") ?? ""}
          placeholder={"Heavy traffic during peak hours\nLimited parking"}
        />
      </div>

      <div className={activeTab === "amenities" ? "flex flex-col gap-4" : "hidden"}>
        <p className="text-xs text-muted">Facilities and lifestyle offerings available in this locality.</p>
        <AmenitiesPicker amenities={amenities} defaultSelectedIds={locality?.amenityIds ?? []} />
      </div>

      <div className={activeTab === "seo" ? "flex flex-col gap-4" : "hidden"}>
        <Field
          label="SEO title"
          name="metaTitle"
          maxLength={70}
          defaultValue={locality?.metaTitle ?? ""}
          placeholder="Defaults to the locality name"
          hint="Up to 70 characters — shown as the browser tab / search result title"
        />
        <Field
          label="SEO description"
          name="metaDescription"
          maxLength={160}
          defaultValue={locality?.metaDescription ?? ""}
          placeholder="Defaults to the description"
          hint="Up to 160 characters — shown as the search result snippet"
        />
        <Field label="Canonical URL" name="canonicalUrl" type="url" defaultValue={locality?.canonicalUrl ?? ""} placeholder="Defaults to the locality's own page" />
        <Field label="Social share image URL (og:image)" name="ogImageUrl" type="url" defaultValue={locality?.ogImageUrl ?? ""} placeholder="Defaults to the cover image" />
      </div>

      <div className={activeTab === "publishing" ? "flex flex-col gap-4" : "hidden"}>
        <FieldGroup>
          <CheckboxField label="Published — visible on the public site" name="isPublished" defaultChecked={locality?.isPublished ?? false} hint="Leave unchecked to keep this a draft" />
          <CheckboxField label="Featured — spotlighted on the homepage" name="isFeatured" defaultChecked={locality?.isFeatured ?? false} />
        </FieldGroup>
      </div>

      <div>
        <SubmitButton>{locality ? "Save changes" : "Create locality"}</SubmitButton>
      </div>
    </form>
  );
}
