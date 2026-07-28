"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importProjectsFileAction, type IngestActionResult } from "@/lib/actions/ingestion";
import { SOURCE_LABEL, type DataSource } from "@/lib/project-meta";
import { Field, SelectField, FormError } from "@/app/admin/components/FormField";
import SubmitButton from "@/app/admin/components/SubmitButton";

// EXTERNAL_OPEN_DATA and AI_GENERATED describe automated feeds/computed values,
// not something a human declares when hand-uploading a file.
const UPLOAD_DATA_SOURCES: DataSource[] = ["OFFICIAL_GOVERNMENT", "BUILDER_INFORMATION", "MANUALLY_VERIFIED", "USER_SUBMITTED"];

const initialState: IngestActionResult = {};

export default function ImportProjectsForm() {
  const [state, formAction] = useActionState(importProjectsFileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <FormError message={state.error} />

      <Field label="CSV or JSON file" name="file" type="file" accept=".csv,.json" required />

      <SelectField label="Source of this file" name="dataSource" required defaultValue="">
        <option value="" disabled>
          Choose the source…
        </option>
        {UPLOAD_DATA_SOURCES.map((d) => (
          <option key={d} value={d}>
            {SOURCE_LABEL[d]}
          </option>
        ))}
      </SelectField>

      <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted">
        <p>
          <span className="text-foreground">Required columns:</span> project name, locality, status.
        </p>
        <p className="mt-1">
          <span className="text-foreground">Optional:</span> RERA number, address, latitude/longitude, builder, total
          units/towers, price min/max, possession date, launch date, description.
        </p>
        <p className="mt-2">
          Every row is staged for review — nothing is created or published automatically. A row matching an existing
          project&apos;s RERA number (or a similar name in the same locality) is proposed as an update, not a duplicate.
        </p>
      </div>

      <SubmitButton pendingText="Uploading…">Upload &amp; stage</SubmitButton>

      {state.summary ? (
        <p className="text-xs text-positive">
          Staged {state.summary.staged}, failed {state.summary.failed}.{" "}
          <Link href="/admin/data-sync/review" className="underline">
            Review now →
          </Link>
        </p>
      ) : null}
    </form>
  );
}
