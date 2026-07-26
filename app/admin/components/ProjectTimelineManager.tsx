"use client";

import { useActionState } from "react";
import { addProjectTimelineEventAction, deleteProjectTimelineEventAction } from "@/lib/actions/project-timeline";
import { formatDate } from "@/lib/format";
import { Field, TextareaField } from "./FormField";
import SubmitButton from "./SubmitButton";
import ConfirmButton from "./ConfirmButton";

export interface ProjectTimelineRow {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date | null;
}

export default function ProjectTimelineManager({ projectId, events }: { projectId: string; events: ProjectTimelineRow[] }) {
  const action = addProjectTimelineEventAction.bind(null, projectId);
  const [state, formAction] = useActionState(action, { error: undefined });

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <h3 className="font-mono text-sm font-semibold text-foreground">Construction timeline</h3>
      <p className="mt-1 text-xs text-muted">Milestones — foundation, structure complete, possession…</p>

      {events.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-2 border-t border-border pt-2 first:border-t-0">
              <div>
                <p className="font-mono text-xs text-foreground">
                  {event.eventDate ? <span className="text-accent">{formatDate(event.eventDate)}</span> : null} {event.title}
                </p>
                {event.description ? <p className="text-[11px] text-muted">{event.description}</p> : null}
              </div>
              <ConfirmButton action={deleteProjectTimelineEventAction.bind(null, event.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">No timeline events yet.</p>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex gap-3">
          <div className="w-40">
            <Field label="Date (optional)" name="eventDate" type="date" />
          </div>
          <div className="flex-1">
            <Field label="Title" name="title" placeholder="Foundation complete" required />
          </div>
        </div>
        <TextareaField label="Description (optional)" name="description" />
        <div>
          <SubmitButton pendingText="Adding...">Add milestone</SubmitButton>
        </div>
      </form>
      {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
    </div>
  );
}
