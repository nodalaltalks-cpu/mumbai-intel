"use client";

import { useActionState } from "react";
import { addBuilderTimelineEventAction, deleteBuilderTimelineEventAction } from "@/lib/actions/builders";
import { Field, TextareaField } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface TimelineEventRow {
  id: string;
  year: number;
  title: string;
  description: string | null;
}

export default function BuilderTimelineManager({ builderId, events }: { builderId: string; events: TimelineEventRow[] }) {
  const action = addBuilderTimelineEventAction.bind(null, builderId);
  const [state, formAction] = useActionState(action, { error: undefined });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Timeline</h3>
      <p className="mt-1 text-xs text-muted">Founding, major deliveries, listings, awards — shown chronologically.</p>

      {events.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div>
                <p className="font-mono text-xs text-foreground">
                  <span className="text-accent">{event.year}</span> — {event.title}
                </p>
                {event.description ? <p className="text-[11px] text-muted">{event.description}</p> : null}
              </div>
              <ConfirmButton action={deleteBuilderTimelineEventAction.bind(null, event.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No timeline events yet.</p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex gap-3">
          <div className="w-24">
            <Field label="Year" name="year" type="number" min={1900} max={2100} required />
          </div>
          <div className="flex-1">
            <Field label="Title" name="title" placeholder="Delivered Lodha Park" required />
          </div>
        </div>
        <TextareaField label="Description (optional)" name="description" />
        <div>
          <SubmitButton pendingText="Adding...">Add event</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
