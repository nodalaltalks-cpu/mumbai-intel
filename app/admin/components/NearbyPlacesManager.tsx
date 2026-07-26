"use client";

import { useActionState, useState } from "react";
import {
  createAndLinkProjectInfraAction,
  linkProjectInfraAction,
  unlinkProjectInfraAction,
} from "@/lib/actions/project-infra";
import { INFRA_TYPES, INFRA_TYPE_LABEL, type InfraTypeValue } from "@/lib/project-meta";
import { Field, SelectField } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface NearbyLinkRow {
  id: string;
  distanceMeters: number;
  walkMinutes: number | null;
  infra: { id: string; name: string; type: InfraTypeValue };
}

export interface InfraOption {
  id: string;
  name: string;
  type: InfraTypeValue;
}

export default function NearbyPlacesManager({
  projectId,
  links,
  infraOptions,
}: {
  projectId: string;
  links: NearbyLinkRow[];
  infraOptions: InfraOption[];
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const linkAction = linkProjectInfraAction.bind(null, projectId);
  const createAction = createAndLinkProjectInfraAction.bind(null, projectId);
  const [linkState, linkFormAction] = useActionState(linkAction, { error: undefined });
  const [createState, createFormAction] = useActionState(createAction, { error: undefined });

  const linkedInfraIds = new Set(links.map((l) => l.infra.id));
  const availableOptions = infraOptions.filter((o) => !linkedInfraIds.has(o.id));

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Nearby places</h3>
      <p className="mt-1 text-xs text-muted">Metro, schools, hospitals, malls, offices — distance and walk time from this project.</p>

      {links.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2">
              <div>
                <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-muted">
                  {INFRA_TYPE_LABEL[link.infra.type]}
                </span>
                <span className="ml-2 text-xs text-foreground">{link.infra.name}</span>
                <span className="ml-2 font-mono text-[11px] text-muted">
                  {link.distanceMeters < 1000 ? `${link.distanceMeters}m` : `${(link.distanceMeters / 1000).toFixed(1)}km`}
                  {link.walkMinutes ? ` · ${link.walkMinutes} min walk` : ""}
                </span>
              </div>
              <ConfirmButton action={unlinkProjectInfraAction.bind(null, link.id)} label="Remove" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No nearby places linked yet.</p>
      )}

      <div className="mt-4 flex gap-1 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`rounded-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide ${mode === "existing" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"}`}
        >
          Link existing
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`rounded-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide ${mode === "new" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"}`}
        >
          Catalogue new place
        </button>
      </div>

      {mode === "existing" ? (
        <form key={links.length} action={linkFormAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <SelectField label="Place" name="infraId" required defaultValue="">
              <option value="" disabled>
                {availableOptions.length === 0 ? "No catalogued places available" : "Select a place"}
              </option>
              {availableOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {INFRA_TYPE_LABEL[o.type]} — {o.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Field label="Distance (m)" name="distanceMeters" type="number" min={0} required />
          <Field label="Walk (min, optional)" name="walkMinutes" type="number" min={0} />
          <div className="col-span-2 sm:col-span-4">
            <SubmitButton pendingText="Linking...">Link place</SubmitButton>
          </div>
          {linkState.error ? <p className="col-span-2 text-xs text-negative sm:col-span-4">{linkState.error}</p> : null}
        </form>
      ) : (
        <form key={links.length} action={createFormAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SelectField label="Type" name="type" defaultValue={INFRA_TYPES[0]}>
            {INFRA_TYPES.map((t) => (
              <option key={t} value={t}>
                {INFRA_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
          <Field label="Name" name="name" placeholder="Ghatkopar Metro Station" required />
          <Field label="Distance (m)" name="distanceMeters" type="number" min={0} required />
          <Field label="Walk (min, optional)" name="walkMinutes" type="number" min={0} />
          <div className="col-span-2 sm:col-span-4">
            <SubmitButton pendingText="Adding...">Catalogue &amp; link</SubmitButton>
          </div>
          {createState.error ? <p className="col-span-2 text-xs text-negative sm:col-span-4">{createState.error}</p> : null}
        </form>
      )}
    </div>
  );
}
